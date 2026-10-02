// Original data-only adapter. The pinned game's text/settings remain private
// runtime resources; no upstream implementation is copied into Chronicle.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export const presentationRevision = '03a7f1e74925744f021f6e8fe0e39945d2c3a833';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const campaignFiles = ['nightOfTheZealot', 'theDunwichLegacy', 'thePathToCarcosa', 'theForgottenAge', 'theCircleUndone', 'theDreamEaters', 'theInnsmouthConspiracy', 'edgeOfTheEarth', 'theScarletKeys', 'theFeastOfHemlockVale', 'theDrownedCity', 'brethrenOfAsh', 'childrenOfBlood', 'side-stories'];

/** Parse only the locale modules' import bindings and object literals, never
 * execute source code. Calls are accepted solely for the excluded homebrew hook.
 */
export async function readLocaleTree(frontend) {
  const root = resolve(frontend, 'src');
  const cache = new Map();
  const read = async path => {
    if (cache.has(path)) return cache.get(path);
    if (!/^en(?:\/|\.ts$)/.test(relative(resolve(root, 'locales'), path))) throw new Error('Only pinned English locale resources may be read.');
    const source = await readFile(path, 'utf8');
    if (path.endsWith('.json')) { const value = JSON.parse(source); cache.set(path, value); return value; }
    const imports = new Map([['homebrewMessages', {}]]);
    for (const match of source.matchAll(/import\s+([A-Za-z_$][\w$]*)\s+from\s+['"]([^'"]+)['"]/g)) {
      const base = match[2].startsWith('@/') ? resolve(root, match[2].slice(2)) : resolve(dirname(path), match[2]);
      let target;
      for (const candidate of [base, `${base}.json`, `${base}.ts`, resolve(base, 'index.ts')]) {
        try { if ((await stat(candidate)).isFile()) { target = candidate; break; } } catch { /* Try the next explicit file form. */ }
      }
      if (!target) throw new Error(`Missing English locale import: ${match[2]}`);
      imports.set(match[1], await read(target));
    }
    const body = source.match(/export\s+default\s+([\s\S]*)/)?.[1];
    if (!body) throw new Error(`Missing locale object export: ${path}`);
    const tokens = []; const pattern = /\s*(\.\.\.|[A-Za-z_$][\w$]*|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[{}\[\],.:();])/y;
    let offset = 0;
    while (offset < body.length && body.slice(offset).trim()) {
      pattern.lastIndex = offset; const match = pattern.exec(body);
      if (!match) throw new Error(`Unsupported locale data syntax: ${path}`);
      tokens.push(match[1]); offset = pattern.lastIndex;
    }
    let index = 0;
    const expect = token => { if (tokens[index++] !== token) throw new Error(`Invalid locale object: ${path}`); };
    const string = token => token.startsWith('"') ? JSON.parse(token) : token.slice(1, -1).replace(/\\'/g, "'");
    const value = () => {
      const token = tokens[index++];
      if (token === '{') {
        const result = {};
        while (tokens[index] !== '}') {
          if (tokens[index] === '...') { index++; Object.assign(result, value()); }
          else { const key = tokens[index++]; const name = /^["']/.test(key) ? string(key) : key; result[name] = tokens[index] === ':' ? (index++, value()) : imports.get(key); }
          if (tokens[index] === ',') index++; else if (tokens[index] !== '}') throw new Error(`Invalid locale member: ${path}`);
        }
        index++; return result;
      }
      if (/^["']/.test(token || '')) return string(token);
      if (!imports.has(token)) throw new Error(`Unknown locale binding: ${token}`);
      let result = imports.get(token);
      if (tokens[index] === '(') { if (token !== 'homebrewMessages') throw new Error('Locale calls are forbidden.'); index++; expect(')'); }
      while (tokens[index] === '[' || tokens[index] === '.') {
        const bracket = tokens[index++] === '['; const key = tokens[index++]; result = result[/^["']/.test(key) ? string(key) : key]; if (bracket) expect(']');
      }
      return result;
    };
    const result = value(); if (tokens[index] === ';') index++;
    if (index !== tokens.length) throw new Error(`Trailing locale code: ${path}`);
    cache.set(path, result); return result;
  };
  return read(resolve(root, 'locales/en.ts'));
}
const flatten = (value, prefix = '', output = {}) => {
  for (const [key, item] of Object.entries(value || {})) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (typeof item === 'string') output[name] = item;
    else if (item && typeof item === 'object') flatten(item, name, output);
  }
  return output;
};
export async function buildCompanionPresentation(source, destination) {
  const frontend = resolve(source, 'frontend');
  const locale = await readLocaleTree(frontend);
  const barkhamScenario = JSON.parse(await readFile(resolve(project, 'rules/extensions/barkham/frontend/locales/en/scenario.json'), 'utf8'));
  const barkhamLog = JSON.parse(await readFile(resolve(project, 'rules/extensions/barkham/frontend/locales/en/log.json'), 'utf8'));
  locale.barkham = { ...barkhamScenario, ...barkhamLog };
  const campaigns = JSON.parse(await readFile(resolve(frontend, 'src/arkham/data/campaigns.json'), 'utf8'));
  const scenarioSettings = {}, campaignSettings = {};
  for (const campaign of campaigns) {
    campaignSettings[campaign.id] = campaign.settings || [];
    if (campaign.returnTo) campaignSettings[campaign.returnTo.id] = campaign.returnTo.settings || campaign.settings || [];
  }
  for (const file of campaignFiles) {
    const scenarios = JSON.parse(await readFile(resolve(frontend, `src/arkham/data/${file}.json`), 'utf8'));
    for (const scenario of scenarios) {
      scenarioSettings[scenario.id] = scenario.settings || [];
      if (typeof scenario.returnTo === 'string') scenarioSettings[scenario.returnTo] = scenario.returnToSettings || scenario.settings || [];
      for (const variant of scenario.scenarios || []) scenarioSettings[variant.id] = variant.settings || scenario.settings || [];
    }
  }
  const result = { sourceRevision: presentationRevision, strings: flatten(locale), scenarioSettings, campaignSettings };
  const sideStories = JSON.parse(await readFile(resolve(frontend, 'src/arkham/data/side-stories.json'), 'utf8'));
  result.sideStories = sideStories.map(({id, name, campaign, xp, requiredInvestigator, deckRequirements, scenarios, standaloneDifficulties, returnToVariant, miniCampaign}) => ({
    id, name, ...(campaign ? {campaign} : {}), ...(xp !== undefined ? {xp} : {}),
    ...(requiredInvestigator ? {requiredInvestigator} : {}), ...(deckRequirements ? {deckRequirements} : {}),
    ...(scenarios ? {scenarios: scenarios.map(({id, name, notAfter}) => ({id, name, ...(notAfter ? {notAfter} : {})}))} : {}),
    ...(standaloneDifficulties ? {standaloneDifficulties} : {}), ...(returnToVariant ? {returnToVariant} : {}), ...(miniCampaign ? {miniCampaign} : {}),
  }));
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, JSON.stringify(result), { mode: 0o600 });
  return result;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = resolve(process.env.ARKHAM_RULES_SOURCE || '/private/tmp/arkham-upstream-research');
  const target = resolve(process.argv[2] || 'output/rules-server/derived-runtime/game/chronicle-presentation.json');
  const result = await buildCompanionPresentation(source, target);
  console.log(`Prepared ${Object.keys(result.strings).length} English strings and ${Object.keys(result.scenarioSettings).length} scenario settings.`);
}
