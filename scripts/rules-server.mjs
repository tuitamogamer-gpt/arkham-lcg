#!/usr/bin/env node
// Original local launcher/bridge for the independent engine and authored extensions.
import { createServer, request as httpRequest } from 'node:http';
import { connect, createServer as createNetServer } from 'node:net';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, stat, readdir, chmod } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogCardCode, engineDeckList } from './rules-protocol.mjs';
import { barkhamCardFace } from './barkham-card-face.mjs';
import { verifyDerivedRuntime } from './rules-runtime-manifest.mjs';
import { chronicleOriginAllowed, publishedChronicleOrigin } from './chronicle-origin.mjs';
import { companionVentNoteAnswer } from './companion-note.mjs';
import { barkhamDeckRejection } from './barkham-deck-guard.mjs';
import { companionEpicReady } from './companion-epic-ready.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const barkhamCards = JSON.parse(await readFile(resolve(project, 'scripts/data/barkham.json'), 'utf8'));
const version = 'v20260904.1';
const sourceUrl = `https://github.com/halogenandtoast/ArkhamHorror/releases/tag/${version}`;
const archiveSha256 = '29061cbdb683cc7b98f56fc45cb64fbc3762e5a21796406c429a936033bacf39';
const releaseFrontendHash = 'dd6603268865bbb739fc6d2ef3114028c52bd528813b010d418b79e26c27ec45';
const migrations = [
  ['arkham_epic', '6dbb6db4470a576739d26723bf7fd3cfb0fbf060af0a1995db9cdcd80c2ac016'],
  ['arkham_game_undo_floors', '06f7ead20709a810a236fd32b2d1d1e570952df44b9e9fcac6f6698710655668'],
  ['arkham_achievements', 'c745fa471206e18c18587f0d72484c279fb8acd8a21f567775949833144d87b7'],
];
const derivedRevision = '03a7f1e74925744f021f6e8fe0e39945d2c3a833';
const derivedMigrations = [
  ['arkham_custom_cards', '55439a38b34c7239dd1debc81f2ff7b341246522ed6ceba997a206faf466d5ad'],
  ['arkham_custom_card_sets', 'd1fd5acf8951e5b66517cc8cf14435e16b7b5e36975624c063f4491166ad5743'],
  ['arkham_published_card_sets', '90d9aa9b92708d081289bd3078db403d9ea5d69f9220ec6de10beda9c12ffce4'],
  ['arkham_published_card_set_likes', '757e149ea11457772b5268ca63e75eaab9be2c108a8d826873e16217c51e4043'],
  ['arkham_api_keys', '8e79e4a2773b7dbb66bf0bb730338c9ad57f874bc66b8f899094b8dd71f46f02'],
  ['arkham_deck_overlay', '5bce74a2ec85bc0a94f7ba2a369c2687e9bb66c5e16e1f8ca93488a89440a265'],
  ['add_last_used_at_to_decks', 'a0f6ada125a64ed5d9fd89734bdf7a45f09b3493dbbf65b8893ccb6d6a354847'],
  ['add_phase_transition_notifications_to_users', '2c90b71eb97dd848d83453e75d9482cdc66fce2f5e9ab2b7d8ed63e14df62dd6'],
];
const dataDir = resolve(process.env.ARKHAM_RULES_DATA_DIR || resolve(project, 'output/rules-server'));
const port = Number(process.env.ARKHAM_RULES_PORT || 5194);
const apiPort = Number(process.env.ARKHAM_RULES_API_PORT || 5195);
const pgPort = Number(process.env.ARKHAM_RULES_PG_PORT || 5196);
const externalApi = process.env.ARKHAM_RULES_API_URL;
let runtime = process.env.ARKHAM_RULES_RUNTIME && resolve(process.env.ARKHAM_RULES_RUNTIME);
const apiUrl = externalApi || `http://127.0.0.1:${apiPort}`;
if (externalApi) {
  const configured = new URL(externalApi);
  if (configured.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(configured.hostname) || !configured.port) throw new Error('ARKHAM_RULES_API_URL must be an HTTP loopback API with an explicit port.');
}
const pgData = resolve(dataDir, 'pgdata');
const dbName = 'arkham_chronicle';
const dbUser = 'arkham_chronicle';
const children = [];
let server;
let ownDatabase = false;
let stopping = false;
let guest;
let cards = [];
let runtimeEnv;
let verifiedArchive = false;
let sourceHash;
let derivedManifest;
const epicSeatTokens = new Map();
const limitations = [
  'Barkham Horror is not implemented by this engine release.',
  'The Drowned City, Guardians of the Abyss, The Labyrinths of Lunacy, War of the Outer Gods and Machinations Through Time include beta content.',
  'Children of Blood includes experimental alpha content in the upstream engine.',
  'A listed card definition is engine coverage, not a certification of every rule interaction; upstream remains a work in progress.',
  'Expanded gameplay needs this local rules service running on the same Mac as the browser.',
  'Card artwork falls back to the upstream CDN and needs an internet connection when it is not bundled locally.',
];

async function exists(path) { try { await stat(path); return true; } catch { return false; } }
async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}
function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { env: runtimeEnv || process.env, stdio: ['pipe', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout.on('data', (data) => { output += data; });
    child.stderr.on('data', (data) => { output += data; });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolvePromise(output) : reject(new Error(`${command.split(sep).at(-1)} failed (${code}). See private runtime logs.`)));
    if (options.input) child.stdin.end(options.input); else child.stdin.end();
  });
}
async function freePort(checkPort) {
  if (!Number.isInteger(checkPort) || checkPort < 1024 || checkPort > 65535) throw new Error('Invalid local service port.');
  await new Promise((resolvePromise, reject) => {
    const probe = createNetServer();
    probe.on('error', () => reject(new Error(`Loopback port ${checkPort} is already in use. Choose another ARKHAM_RULES port.`)));
    probe.listen(checkPort, '127.0.0.1', () => probe.close(resolvePromise));
  });
}
async function prepareRuntime() {
  const derived = resolve(project, 'output/rules-server/derived-runtime/game');
  if (!runtime && !externalApi && await exists(resolve(derived, 'chronicle-runtime.json'))) {
    derivedManifest = await verifyDerivedRuntime(derived, resolve(project, 'rules/extensions/barkham'));
    runtime = derived;
  } else if (runtime && !externalApi) {
    derivedManifest = await verifyDerivedRuntime(runtime);
  }
  if (!runtime) {
    if (process.platform !== 'darwin' || process.arch !== 'arm64') throw new Error('Automatic installation supports macOS Apple Silicon. Set ARKHAM_RULES_RUNTIME to an unpacked compatible upstream release.');
    const packageDir = resolve(dataDir, 'runtime');
    const archive = resolve(dataDir, 'runtime.tar.gz');
    runtime = resolve(packageDir, 'game');
    if (!(await exists(archive)) || await sha256(archive) !== archiveSha256) {
      console.log(`Downloading official Arkham engine ${version} (197 MB).`);
      const downloadUrl = `https://github.com/halogenandtoast/ArkhamHorror/releases/download/${version}/ArkhamHorror-macos-arm64-${version}.tar.gz`;
      const response = await fetch(downloadUrl);
      if (!response.ok || !response.body) throw new Error('Could not download the official engine release.');
      await pipeline(Readable.fromWeb(response.body), createWriteStream(archive, { mode: 0o600 }));
    }
    if (await sha256(archive) !== archiveSha256) throw new Error('The downloaded engine does not match the pinned SHA-256.');
    if (!(await exists(resolve(runtime, 'bin/arkham-api')))) {
      await mkdir(packageDir, { recursive: true, mode: 0o700 });
      await run('tar', ['-xzf', archive, '-C', packageDir]);
    }
    verifiedArchive = !externalApi;
  }
  if (!(await exists(resolve(runtime, 'bin/arkham-api'))) || !(await exists(resolve(runtime, 'frontend/dist/index.html')))) throw new Error('ARKHAM_RULES_RUNTIME must point to the distribution game directory.');
  // Yesod creates its private session key at startup. Fresh derived packages
  // need the parent directory; the key stays in ignored local runtime data.
  await mkdir(resolve(runtime, 'config'), { recursive: true, mode: 0o700 });
  sourceHash = (await readFile(resolve(runtime, 'frontend/dist/source_hash'), 'utf8').catch(() => '')).trim();
  if (verifiedArchive && sourceHash !== releaseFrontendHash) throw new Error('The extracted frontend does not match the pinned release.');
  runtimeEnv = {
    ...process.env,
    DYLD_LIBRARY_PATH: [resolve(runtime, 'lib'), resolve(runtime, 'pgsql/lib'), process.env.DYLD_LIBRARY_PATH].filter(Boolean).join(':'),
    LD_LIBRARY_PATH: [resolve(runtime, 'lib'), resolve(runtime, 'pgsql/lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
  };
  // Upstream distributions require macOS installation signatures. This changes
  // signatures only, without rewriting the engine or frontend source.
  const signingMarker = resolve(dataDir, 'signed-runtime.json');
  const previousSigning = JSON.parse(await readFile(signingMarker, 'utf8').catch(() => '{}'));
  if (!derivedManifest && process.platform === 'darwin' && (previousSigning.runtime !== runtime || previousSigning.sourceHash !== sourceHash)) {
    async function signDirectory(path) {
      for (const entry of await readdir(path, { withFileTypes: true })) {
        const file = resolve(path, entry.name);
        if (entry.isDirectory()) await signDirectory(file);
        else if (entry.isFile()) {
          const description = await run('file', [file]);
          if (!description.includes('Mach-O')) continue;
          await chmod(file, (await stat(file)).mode | 0o200);
          await run('codesign', ['--force', '--sign', '-', file]);
        }
      }
    }
    for (const folder of ['bin', 'lib', 'pgsql/bin', 'pgsql/lib']) await signDirectory(resolve(runtime, folder));
    await writeFile(signingMarker, JSON.stringify({ runtime, sourceHash }), { mode: 0o600 });
  }
}
async function psql(sql, database = dbName) {
  return run(resolve(runtime, 'pgsql/bin/psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', database, '-v', 'ON_ERROR_STOP=1', '-c', sql]);
}
async function startEngine() {
  await freePort(apiPort);
  await freePort(pgPort);
  if (!(await exists(resolve(pgData, 'PG_VERSION')))) await run(resolve(runtime, 'pgsql/bin/initdb'), ['-D', pgData, '-U', dbUser, '--no-locale', '-E', 'UTF8', '--auth-local=trust', '--auth-host=trust']);
  await run(resolve(runtime, 'pgsql/bin/pg_ctl'), ['-D', pgData, '-l', resolve(dataDir, 'postgres.log'), '-o', `-p ${pgPort} -h 127.0.0.1 -k ${dataDir} -B 32MB`, 'start']);
  ownDatabase = true;
  const dbExists = await psql(`SELECT 1 FROM pg_database WHERE datname='${dbName}'`, 'postgres');
  if (!/\n\s*1\s*\n/.test(dbExists)) {
    await psql(`CREATE DATABASE ${dbName}`, 'postgres');
    await run(resolve(runtime, 'pgsql/bin/psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', resolve(runtime, 'data/setup.sql')]);
  }
  // The official offline archive's setup.sql predates three migrations required
  // by its own executable. Fetch their published, pinned SQL as runtime data.
  if (sourceHash === releaseFrontendHash || derivedManifest?.baseReleaseSha256 === archiveSha256) {
    const migrationDir = resolve(dataDir, 'migrations');
    await mkdir(migrationDir, { recursive: true, mode: 0o700 });
    for (const [name, expectedHash] of migrations) {
      const migrationFile = resolve(migrationDir, `${name}.sql`);
      if (!(await exists(migrationFile))) {
        const response = await fetch(`https://raw.githubusercontent.com/halogenandtoast/ArkhamHorror/${version}/migrations/deploy/${name}.sql`);
        if (!response.ok) throw new Error(`Could not obtain pinned database migration ${name}.`);
        await writeFile(migrationFile, await response.text(), { mode: 0o600 });
      }
      if (await sha256(migrationFile) !== expectedHash) throw new Error(`Pinned migration ${name} failed SHA-256 verification.`);
      await run(resolve(runtime, 'pgsql/bin/psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', migrationFile]);
    }
  }
  if (derivedManifest?.upstreamRevision === derivedRevision) {
    const migrationDir = resolve(dataDir, 'migrations', derivedRevision.slice(0, 7));
    await mkdir(migrationDir, { recursive: true, mode: 0o700 });
    const marker = resolve(migrationDir, 'applied.json');
    if (!(await exists(marker))) {
      const backupDir = resolve(dataDir, 'backups');
      await mkdir(backupDir, { recursive: true, mode: 0o700 });
      const backup = resolve(backupDir, `before-${derivedRevision.slice(0, 7)}-${Date.now()}.dump`);
      await run(resolve(runtime, 'pgsql/bin/pg_dump'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', dbName, '--format=custom', '--file', backup]);
      await chmod(backup, 0o600);
    }
    for (const [name, expectedHash] of derivedMigrations) {
      const file = resolve(migrationDir, `${name}.sql`);
      if (!(await exists(file))) {
        const response = await fetch(`https://raw.githubusercontent.com/halogenandtoast/ArkhamHorror/${derivedRevision}/migrations/deploy/${name}.sql`);
        if (!response.ok) throw new Error(`Could not obtain derived database migration ${name}.`);
        await writeFile(file, await response.text(), { mode: 0o600 });
      }
      if (await sha256(file) !== expectedHash) throw new Error(`Derived migration ${name} failed SHA-256 verification.`);
      await run(resolve(runtime, 'pgsql/bin/psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', file]);
    }
    await writeFile(marker, JSON.stringify({ revision: derivedRevision, migrations: derivedMigrations.map(([name, sha256]) => ({ name, sha256 })) }), { mode: 0o600 });
    for (const id of ['epic-labyrinth', 'epic-machinations']) {
      if (!derivedManifest.extensions.includes(id)) continue;
      const source = resolve(project, 'rules/extensions', id, 'migrations.sql');
      const marker = resolve(migrationDir, `${id}.json`);
      if (!(await exists(marker))) {
        const backupDir = resolve(dataDir, 'backups');
        await mkdir(backupDir, { recursive: true, mode: 0o700 });
        const backup = resolve(backupDir, `before-${id}-${Date.now()}.dump`);
        await run(resolve(runtime, 'pgsql/bin/pg_dump'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', dbName, '--format=custom', '--file', backup]);
        await chmod(backup, 0o600);
      }
      await run(resolve(runtime, 'pgsql/bin/psql'), ['-h', '127.0.0.1', '-p', String(pgPort), '-U', dbUser, '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-f', source]);
      await writeFile(marker, JSON.stringify({ extension: id, sourceSha256: await sha256(source) }), { mode: 0o600 });
    }
  }
  const configPath = resolve(dataDir, 'local-secrets.json');
  let config;
  if (await exists(configPath)) config = JSON.parse(await readFile(configPath, 'utf8'));
  else {
    config = { jwtSecret: randomBytes(48).toString('hex'), email: `chronicle-${randomUUID()}@localhost.invalid`, password: randomBytes(32).toString('hex') };
    await writeFile(configPath, JSON.stringify(config), { mode: 0o600 });
  }
  guest = config;
  const log = createWriteStream(resolve(dataDir, 'engine.log'), { flags: 'a', mode: 0o600 });
  const api = spawn(resolve(runtime, 'bin/arkham-api'), ['+RTS', '-N2', '-A16m', '-RTS'], {
    cwd: runtime,
    env: { ...runtimeEnv, HOST: '127.0.0.1', PORT: String(apiPort), PGHOST: '127.0.0.1', PGPORT: String(pgPort), PGSSLMODE: 'disable', DATABASE_URL: `postgres://${dbUser}@127.0.0.1:${pgPort}/${dbName}`, JWT_SECRET: config.jwtSecret, ASSET_HOST: 'https://assets.arkhamhorror.app' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(api);
  api.stdout.pipe(log); api.stderr.pipe(log);
  api.on('error', () => { if (!stopping) void stop(1); });
  api.on('exit', () => { if (!stopping) void stop(1); });
  for (let tries = 0; tries < 150; tries++) {
    try { if ((await fetch(`${apiUrl}/health`)).ok) {
      if (await exists(resolve(runtime, 'config/client_session_key.aes'))) await chmod(resolve(runtime, 'config/client_session_key.aes'), 0o600);
      return;
    } } catch {}
    if (api.exitCode !== null) throw new Error('The local engine stopped. Check output/rules-server/engine.log.');
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 200));
  }
  throw new Error('The local rules engine did not become ready.');
}
async function engineJson(path, body, method = body === undefined ? 'GET' : 'POST', authenticated = false) {
  const response = await fetch(`${apiUrl}/api/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Token ${typeof authenticated === 'string' ? authenticated : guest.token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(`The rules engine rejected the request (${response.status}).`);
    error.status = response.status; error.details = data;
    throw error;
  }
  return data;
}
async function session() {
  if (!guest) {
    const configPath = resolve(dataDir, 'local-secrets.json');
    guest = await exists(configPath) ? JSON.parse(await readFile(configPath, 'utf8')) : { email: `chronicle-${randomUUID()}@localhost.invalid`, password: randomBytes(32).toString('hex') };
    await writeFile(configPath, JSON.stringify({ email: guest.email, password: guest.password }), { mode: 0o600 });
  }
  let result;
  try { result = await engineJson('authenticate', { email: guest.email, password: guest.password }); }
  catch (error) {
    if (error.status !== 401) throw error;
    result = await engineJson('register', { username: 'Chronicle local player', email: guest.email, password: guest.password });
  }
  guest.token = result.token;
  if (ownDatabase) await psql(`UPDATE public.users SET beta=true WHERE email='${guest.email}'`);
}
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
async function epicSeats(eventId) {
  if (!uuidPattern.test(eventId)) throw new Error('Invalid Epic event.');
  const path = resolve(dataDir, 'epic-seats', `${eventId}.json`);
  return { path, seats: JSON.parse(await readFile(path, 'utf8').catch(() => '[]')) };
}
async function epicSeatToken(seat) {
  if (epicSeatTokens.has(seat.id)) return epicSeatTokens.get(seat.id);
  let account;
  try { account = await engineJson('authenticate', { email: seat.email, password: seat.password }); }
  catch (error) {
    if (error.status !== 401) throw error;
    account = await engineJson('register', { username: seat.name, email: seat.email, password: seat.password });
  }
  if (ownDatabase) await psql(`UPDATE public.users SET beta=true WHERE email='${seat.email}'`);
  epicSeatTokens.set(seat.id, account.token);
  return account.token;
}
async function findEpicSeat(id) {
  if (!uuidPattern.test(id)) throw new Error('Invalid local Epic seat.');
  const folder = resolve(dataDir, 'epic-seats');
  for (const entry of await readdir(folder).catch(() => [])) {
    if (!uuidPattern.test(entry.replace(/\.json$/, ''))) continue;
    const { seats } = await epicSeats(entry.replace(/\.json$/, ''));
    const seat = seats.find(seat => seat.id === id);
    if (seat) return seat;
  }
  throw new Error('This local Epic seat is unavailable.');
}
function originAllowed(origin) {
  return chronicleOriginAllowed(origin);
}
function cors(req, res) {
  const origin = req.headers.origin;
  if (!originAllowed(origin)) { res.writeHead(403); res.end('Local Chronicle origin required.'); return false; }
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.headers['access-control-request-private-network'] === 'true') res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
  return true;
}
function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); }
async function body(req) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > 5 * 1024 * 1024) throw new Error('Request body is too large.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
async function handle(req, res) {
  const host = req.headers.host || '';
  if (!new Set([`127.0.0.1:${port}`, `localhost:${port}`]).has(host)) { res.writeHead(403); res.end('Local service host required.'); return; }
  if (!cors(req, res)) return;
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, `http://127.0.0.1:${port}`);
  const barkhamFace = url.pathname.match(/^\/chronicle\/barkham\/card\/(\d{3})(b)?\.svg$/);
  if (barkhamFace) {
    const definition = barkhamCards.find((card) => card.code === `barkham-${barkhamFace[1]}`);
    if (!definition || definition.miniature) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'image/svg+xml; charset=utf-8', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'" });
    res.end(barkhamCardFace(definition, !!barkhamFace[2])); return;
  }
  if (url.pathname === '/chronicle/status') {
    const supportedCardCodes = [...new Set(cards.flatMap((card) => [card.cardCode, card.art, ...(card.alternateCardCodes || [])]).filter(Boolean).map(catalogCardCode))];
    const barkhamRegistered = Array.from({ length: 57 }, (_, index) => `barkham-${String(index + 1).padStart(3, '0')}`).every((code) => supportedCardCodes.includes(code));
    const runtimeLimitations = derivedManifest && barkhamRegistered ? limitations.filter((text) => !text.startsWith('Barkham Horror is not implemented')) : derivedManifest ? [...limitations.filter((text) => !text.startsWith('Barkham Horror is not implemented')), 'The loaded Barkham extension has an incomplete card registry.'] : limitations;
    json(res, 200, { ready: (await fetch(`${apiUrl}/health`)).ok, extensions: derivedManifest?.extensions || [], version: derivedManifest ? `Chronicle + Barkham (${derivedManifest.upstreamRevision.slice(0, 7)})` : verifiedArchive ? version : 'Custom runtime (unverified release)', sourceUrl: derivedManifest ? `https://github.com/halogenandtoast/ArkhamHorror/tree/${derivedManifest.upstreamRevision}` : verifiedArchive ? sourceUrl : 'https://github.com/halogenandtoast/ArkhamHorror', ...(verifiedArchive ? { archiveSha256 } : {}), ...(derivedManifest ? { binarySha256: derivedManifest.binarySha256, extensionSourceSha256: derivedManifest.extensionSourceSha256 } : {}), sourceHash, supportedCardCodes, investigatorCodes: cards.filter((card) => card.cardType === 'InvestigatorType').map((card) => catalogCardCode(card.art)), scenarioIds: cards.filter((card) => card.cardType === 'ScenarioType').map((card) => catalogCardCode(card.cardCode)), limitations: runtimeLimitations }); return;
  }
  if (url.pathname === '/chronicle/session') {
    const seatId = url.searchParams.get('seat');
    json(res, 200, { token: seatId ? await epicSeatToken(await findEpicSeat(seatId)) : guest.token }); return;
  }
  // Original Chronicle presentation uses the native rules without moving
  // session credentials into its client. Epic seats are bound to one game.
  const playGame = url.pathname.match(/^\/chronicle\/play\/games\/([a-f0-9-]+)(?:\/(answer|undo|step|upgrade-deck|vent-note|ready))?$/);
  if (url.pathname === '/chronicle/play/options' && req.method === 'GET') {
    json(res, 200, JSON.parse(await readFile(resolve(project, 'scripts/data/native-play-options.json'), 'utf8'))); return;
  }
  if (url.pathname === '/chronicle/play/card-definitions' && req.method === 'GET') {
    json(res, 200, cards.map(({cardCode, art, name, revealedName, cardType, doubleSided, otherSide, alternateCardCodes, meta}) => ({
      cardCode, art, name, cardType,
      ...(revealedName ? {revealedName} : {}),
      ...(doubleSided ? {doubleSided} : {}),
      ...(otherSide ? {otherSide} : {}),
      ...(alternateCardCodes ? {alternateCardCodes} : {}),
      ...(meta?.customBack ? {customBack:meta.customBack} : {}),
    }))); return;
  }
  if (url.pathname === '/chronicle/play/presentation' && req.method === 'GET') {
    const path = resolve(runtime, 'chronicle-presentation.json');
    let presentation;
    try { presentation = JSON.parse(await readFile(path, 'utf8')); }
    catch { json(res, 503, { error: 'Prepare the Chronicle presentation resources with npm run rules:build, then reconnect.' }); return; }
    if (presentation.sourceRevision !== derivedRevision) { json(res, 409, { error: 'Presentation resources do not match the installed rules.' }); return; }
    json(res, 200, presentation); return;
  }
  if (url.pathname === '/chronicle/play/games' && req.method === 'POST') {
    const input = await body(req);
    const options = JSON.parse(await readFile(resolve(project, 'scripts/data/native-play-options.json'), 'utf8'));
    const campaign = input.campaignId ? options.campaigns.find(option => option.id === input.campaignId || option.returnTo?.id === input.campaignId) : null;
    const scenario = input.scenarioId ? options.scenarios.find(option => option.id === input.scenarioId && option.variant === input.variant) : null;
    const difficulties = scenario?.standaloneDifficulties || ['Easy', 'Standard', 'Hard', 'Expert'];
    if (!!input.campaignId === !!input.scenarioId || !campaign && !scenario || input.campaignId && !campaign || input.scenarioId && !scenario || !difficulties.includes(input.difficulty) || !Number.isInteger(input.playerCount) || input.playerCount < 1 || input.playerCount > 4 || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120) { json(res, 400, { error: 'Choose a published campaign or scenario, difficulty and one to four investigators.' }); return; }
    if (scenario?.id.startsWith(':barkham:') && !derivedManifest?.extensions.includes('barkham')) { json(res, 409, { error: 'Build and connect the Barkham extension first.' }); return; }
    if (input.variant && campaign && !campaign.variants?.some(v=>v.key === input.variant)) { json(res, 400, {error:'Choose a printed campaign path.'}); return; }
    const gameOptions = campaign && input.variant ? [{tag:'CampaignVariant',contents:input.variant}] : scenario?.variant === 'blobElse' ? [{tag:'PlayWithTheBlobThatAteEverythingElse'}] : scenario?.variant === 'mini' ? [{tag:'PlayAsMiniCampaign'}] : [];
    json(res, 200, await engineJson('arkham/games', { deckIds: Array(input.playerCount).fill(null), playerCount: input.playerCount, campaignId: campaign ? input.campaignId : null, scenarioId: scenario?.id || null, difficulty: input.difficulty, campaignName: input.name.trim(), multiplayerVariant: 'Solo', includeTarotReadings: false, options: gameOptions }, 'POST', true)); return;
  }
  if (url.pathname === '/chronicle/play/games' || url.pathname === '/chronicle/play/decks' || playGame) {
    if (playGame && !uuidPattern.test(playGame[1])) { json(res, 400, { error: 'Invalid investigation.' }); return; }
    const seatId = url.searchParams.get('seat');
    const seat = seatId ? await findEpicSeat(seatId) : null;
    if (seat && (!playGame || seat.gameId !== playGame[1]) && url.pathname !== '/chronicle/play/decks') { json(res, 403, { error: 'This seat belongs to another investigation.' }); return; }
    const authentication = seat ? await epicSeatToken(seat) : true;
    if (playGame?.[2] === 'ready') {
      json(res, 200, await companionEpicReady(seat, playGame[1], req.method,
        (path, input, method) => engineJson(path, input, method, authentication))); return;
    }
    if (req.method === 'GET' && playGame?.[2] === 'step') {
      json(res, 200, await engineJson(`arkham/games/${playGame[1]}/step`, undefined, 'GET', authentication)); return;
    }
    if (req.method === 'GET' && !playGame?.[2]) {
      const path = playGame ? `arkham/games/${playGame[1]}` : url.pathname.endsWith('/decks') ? 'arkham/decks' : 'arkham/games';
      json(res, 200, await engineJson(path, undefined, 'GET', authentication)); return;
    }
    if (req.method === 'POST' && playGame?.[2] === 'answer') {
      const reply = await body(req);
      if (!reply || typeof reply.tag !== 'string' || !/^[A-Za-z]+Answer$/.test(reply.tag) && reply.tag !== 'Answer') { json(res, 400, { error: 'Choose a native rules answer.' }); return; }
      // An imported deck list crosses the same boundary as /chronicle/decks:
      // the engine reads meta as a JSON string and namespaced extension codes.
      if (reply.tag === 'DeckListAnswer' && reply.deckList && typeof reply.deckList === 'object' && !Array.isArray(reply.deckList)) reply.deckList = engineDeckList(reply.deckList);
      if (reply.tag === 'DeckAnswer' && reply.overlay == null) {
        const [snapshot, savedDecks] = await Promise.all([
          engineJson(`arkham/games/${playGame[1]}`, undefined, 'GET', authentication),
          engineJson('arkham/decks', undefined, 'GET', authentication),
        ]);
        const deck = Array.isArray(savedDecks) ? savedDecks.find(saved => saved.id === reply.deckId) : null;
        const rejection = deck ? barkhamDeckRejection(snapshot, deck) : null;
        if (rejection) { json(res, 400, { error: rejection }); return; }
      }
      json(res, 200, await engineJson(`arkham/games/${playGame[1]}`, reply, 'PUT', authentication)); return;
    }
    if (req.method === 'POST' && playGame?.[2] === 'vent-note') {
      const input = await body(req);
      const snapshot = await engineJson(`arkham/games/${playGame[1]}`, undefined, 'GET', authentication);
      let answer;
      try { answer = companionVentNoteAnswer(snapshot, input); }
      catch (error) { json(res, 409, { error: error.message }); return; }
      await engineJson(`arkham/games/${playGame[1]}`, answer, 'PUT', authentication);
      json(res, 200, await engineJson(`arkham/games/${playGame[1]}`, undefined, 'GET', authentication)); return;
    }
    if (req.method === 'POST' && playGame?.[2] === 'undo') {
      await engineJson(`arkham/games/${playGame[1]}/undo`, undefined, 'PUT', authentication);
      json(res, 200, await engineJson(`arkham/games/${playGame[1]}`, undefined, 'GET', authentication)); return;
    }
    if (req.method === 'POST' && playGame?.[2] === 'upgrade-deck') {
      const upgrade = await body(req);
      if (typeof upgrade.investigatorId !== 'string' || upgrade.deckList !== undefined && (!upgrade.deckList || typeof upgrade.deckList !== 'object' || Array.isArray(upgrade.deckList)) || upgrade.deckUrl !== undefined && (typeof upgrade.deckUrl !== 'string' || !/^https:\/\/arkhamdb\.com\/deck(?:list)?\/view\/\d+(?:\/[^?]*)?$/.test(upgrade.deckUrl))) { json(res, 400, { error: 'Choose a valid investigator and upgrade deck.' }); return; }
      if (upgrade.deckList) upgrade.deckList = engineDeckList(upgrade.deckList);
      await engineJson(`arkham/games/${playGame[1]}/decks`, upgrade, 'PUT', authentication);
      json(res, 200, await engineJson(`arkham/games/${playGame[1]}`, undefined, 'GET', authentication)); return;
    }
    json(res, 405, { error: 'Use the investigation read or answer operation.' }); return;
  }
  if (url.pathname === '/chronicle/epic/events') {
    if (req.method === 'GET') { json(res, 200, await engineJson('arkham/events', undefined, 'GET', true)); return; }
    if (req.method === 'POST') {
      const input = await body(req);
      const extension = input.scenarioId === '70001' ? 'epic-labyrinth' : input.scenarioId === '87001' ? 'epic-machinations' : null;
      if (!extension || !derivedManifest?.extensions?.includes(extension)) { json(res, 409, { error: 'The connected engine does not implement this Epic scenario.' }); return; }
      const difficulties = input.scenarioId === '70001' ? ['Standard', 'Hard'] : ['Easy', 'Standard', 'Hard', 'Expert'];
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 120 || !difficulties.includes(input.difficulty) || !Array.isArray(input.groups) || input.groups.length !== 3 || input.groups.some(group => typeof group.name !== 'string' || !group.name.trim() || group.name.length > 100 || !Number.isInteger(group.playerCount) || group.playerCount < 1 || group.playerCount > 4)) { json(res, 400, { error: 'Choose three groups of one to four investigators and a printed difficulty.' }); return; }
      if (input.scenarioId === '87001' && input.groups.some(group => group.groupDifficulty !== undefined && !difficulties.includes(group.groupDifficulty))) { json(res, 400, { error: 'Choose a printed difficulty for each era.' }); return; }
      const groups = input.groups.map(group => ({ name: group.name.trim(), playerCount: group.playerCount, ...(input.scenarioId === '87001' ? { groupDifficulty: group.groupDifficulty || input.difficulty } : {}) }));
      const event = await engineJson('arkham/events', { name: input.name.trim(), scenarioId: input.scenarioId, difficulty: input.difficulty, includeTarotReadings: false, playWithBlobElse: false, timeLimitMinutes: input.scenarioId === '70001' ? 60 : 180, groups }, 'POST', true);
      const saved = await epicSeats(event.id);
      await mkdir(dirname(saved.path), { recursive: true, mode: 0o700 });
      const seats = event.groups.flatMap(group => Array.from({ length: group.seatCount }, (_, seatIndex) => ({ id: randomUUID(), eventId: event.id, gameId: group.gameId, ordinal: group.ordinal, seatIndex, name: `${group.name} · seat ${seatIndex + 1}`, email: `chronicle-epic-${randomUUID()}@localhost.invalid`, password: randomBytes(32).toString('hex') })));
      await writeFile(saved.path, JSON.stringify(seats), { mode: 0o600 });
      json(res, 200, { ...event, localSeats: seats.map(({ id, gameId, ordinal, seatIndex, name }) => ({ id, gameId, ordinal, seatIndex, name })) }); return;
    }
  }
  const epicEventMatch = url.pathname.match(/^\/chronicle\/epic\/events\/([a-f0-9-]+)$/);
  if (epicEventMatch && req.method === 'GET') {
    const event = await engineJson(`arkham/events/${epicEventMatch[1]}`, undefined, 'GET', true);
    const { seats } = await epicSeats(event.id);
    json(res, 200, { ...event, localSeats: seats.map(({ id, gameId, ordinal, seatIndex, name, deckId }) => ({ id, gameId, ordinal, seatIndex, name, deckId })) }); return;
  }
  const epicSeatMatch = url.pathname.match(/^\/chronicle\/epic\/seats\/([a-f0-9-]+)$/);
  if (epicSeatMatch && req.method === 'POST') {
    const seat = await findEpicSeat(epicSeatMatch[1]);
    const token = await epicSeatToken(seat);
    const input = await body(req);
    if (!input.deckList || typeof input.deckList.investigator_code !== 'string' || typeof input.deckName !== 'string') { json(res, 400, { error: 'Choose a validated investigator deck for this seat.' }); return; }
    const deckList = engineDeckList(input.deckList);
    await engineJson('arkham/decks/validate', deckList, 'POST', token);
    let deckId = seat.deckId;
    if (!deckId) {
      const imported = await engineJson('arkham/decks', { deckId: randomUUID(), deckName: input.deckName, deckUrl: null, deckList }, 'POST', token);
      deckId = imported.id;
      const saved = await epicSeats(seat.eventId);
      saved.seats.find(stored => stored.id === seat.id).deckId = deckId;
      await writeFile(saved.path, JSON.stringify(saved.seats), { mode: 0o600 });
    }
    await engineJson(`arkham/games/${seat.gameId}/join`, {}, 'PUT', token);
    json(res, 200, { gameId: seat.gameId, seatId: seat.id, deckId }); return;
  }
  if (url.pathname === '/chronicle/decks' && req.method === 'POST') {
    const request = await body(req);
    if (typeof request.deckName !== 'string' || !request.deckList || typeof request.deckList.investigator_code !== 'string' || !request.deckList.slots) { json(res, 400, { error: 'A deckName and ArkhamDB deckList are required.' }); return; }
    const deckList = engineDeckList(request.deckList);
    await engineJson('arkham/decks/validate', deckList, 'POST', true);
    const deck = await engineJson('arkham/decks', { deckId: randomUUID(), deckName: request.deckName, deckUrl: null, deckList }, 'POST', true);
    json(res, 200, deck); return;
  }
  if (url.pathname === '/chronicle/open') {
    const requested = url.searchParams.get('path') || '/campaigns/new';
    const path = /^\/(?:campaigns\/new|decks|cards|games(?:\/[a-f0-9-]+)?)?$/.test(requested) ? requested : '/campaigns/new';
    res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Security-Policy': `default-src 'self'; script-src 'unsafe-inline'; connect-src 'self'; style-src 'unsafe-inline'; frame-ancestors http://localhost:* http://127.0.0.1:* ${publishedChronicleOrigin}` });
    const seatId = url.searchParams.get('seat');
    if (seatId) {
      const seat = await findEpicSeat(seatId);
      if (path !== `/games/${seat.gameId}`) { json(res, 400, { error: 'Open the game belonging to this Epic seat.' }); return; }
    }
    const sessionPath = '/chronicle/session' + (seatId ? `?seat=${encodeURIComponent(seatId)}` : '');
    res.end(`<!doctype html><meta charset="utf-8"><title>Arkham rules table</title><style>body{background:#15181b;color:#f6e9d5;font:16px system-ui;padding:32px}</style><p id="status">Opening your Arkham table…</p><script>fetch(${JSON.stringify(sessionPath)}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(s=>{localStorage.setItem('arkham-token',s.token);localStorage.setItem('alpha','true');document.cookie='arkham-token='+encodeURIComponent(s.token)+'; Path=/; SameSite=Lax';location.replace('/#'+${JSON.stringify(path)})}).catch(()=>document.getElementById('status').textContent='The local rules service is unavailable.')</script>`); return;
  }
  if (url.pathname.startsWith('/api/') || url.pathname === '/health') {
    const upstream = httpRequest(new URL(req.url, apiUrl), { method: req.method, headers: { ...req.headers, host: new URL(apiUrl).host } }, (response) => {
      for (const [name, value] of Object.entries(response.headers)) if (!name.startsWith('access-control-') && value !== undefined) res.setHeader(name, value);
      res.writeHead(response.statusCode || 502); response.pipe(res);
    });
    upstream.on('error', () => { if (!res.headersSent) json(res, 502, { error: 'Rules engine unavailable.' }); else res.destroy(); });
    req.pipe(upstream); return;
  }
  const root = resolve(runtime, 'frontend/dist');
  const file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
  if (file !== root && !file.startsWith(root + sep)) { res.writeHead(400); res.end(); return; }
  if (!(await exists(file))) {
    if (url.pathname.startsWith('/img/')) { res.writeHead(302, { Location: `https://assets.arkhamhorror.app${url.pathname}` }); res.end(); }
    else { res.writeHead(404); res.end('Not found'); }
    return;
  }
  if (!(await stat(file)).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
  createReadStream(file).pipe(res);
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server?.close();
  for (const child of children) child.kill('SIGTERM');
  if (ownDatabase) await run(resolve(runtime, 'pgsql/bin/pg_ctl'), ['-D', pgData, '-m', 'fast', 'stop']).catch(() => {});
  process.exit(code);
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
try {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await freePort(port);
  await prepareRuntime();
  if (!externalApi) await startEngine();
  await session();
  cards = await engineJson('arkham/cards?includeEncounter&cardPool=both');
  server = createServer((req, res) => { handle(req, res).catch((error) => { if (!res.headersSent) json(res, error.status || 500, { error: error.message, ...(error.details ? { details: error.details } : {}) }); else res.destroy(); }); });
  server.on('upgrade', (req, socket, head) => {
    if (!new Set([`127.0.0.1:${port}`, `localhost:${port}`]).has(req.headers.host) || !originAllowed(req.headers.origin) || !req.url.startsWith('/api/')) { socket.destroy(); return; }
    const upstream = connect(Number(new URL(apiUrl).port), '127.0.0.1', () => {
      const headers = { ...req.headers, host: new URL(apiUrl).host };
      upstream.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${Object.entries(headers).map(([name, value]) => `${name}: ${value}`).join('\r\n')}\r\n\r\n`);
      if (head.length) upstream.write(head);
      socket.pipe(upstream); upstream.pipe(socket);
    });
    upstream.on('error', () => socket.destroy()); socket.on('error', () => upstream.destroy()); socket.on('close', () => upstream.destroy());
  });
  await new Promise((resolvePromise, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolvePromise); });
  console.log(`Arkham rules service ${derivedManifest ? `Chronicle + ${derivedManifest.extensions.join(', ')} (${derivedRevision.slice(0, 7)})` : verifiedArchive ? version : '(custom runtime, unverified release)'}: http://127.0.0.1:${port}`);
  console.log(`Live registry: ${cards.length} card definitions. Saved games: ${dataDir}`);
  console.log('Keep this process running while using the full rules table. Ctrl+C stops the services.');
} catch (error) {
  console.error(error.message);
  await stop(1);
}
