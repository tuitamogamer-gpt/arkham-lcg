import { open } from "node:fs/promises";
import { posix } from "node:path";

const importCommands = new Set([0xc, 0x80000018, 0x8000001f, 0x20, 0x80000023]);
const persistentLibpq = "@loader_path/../lib/libpq.5.dylib";
const persistentRpath = "@loader_path/../lib";

function roots(paths, name) {
  if (!Array.isArray(paths) || paths.length < 1 || paths.length > 16)
    throw new Error(`Expected explicit ${name} roots.`);
  for (const path of paths)
    if (
      typeof path !== "string" ||
      !posix.isAbsolute(path) ||
      path === "/" ||
      posix.normalize(path) !== path ||
      /[\0-\x1f\x7f]/.test(path)
    )
      throw new Error(`Invalid bounded ${name} root.`);
  return [...new Set(paths)];
}

function inside(path, root) {
  return path === root || path.startsWith(root + "/");
}

function commandBounds(header) {
  if (
    !Buffer.isBuffer(header) ||
    header.length !== 32 ||
    header.readUInt32LE(0) !== 0xfeedfacf ||
    header.readUInt32LE(4) !== 0x0100000c ||
    header.readUInt32LE(12) !== 2
  )
    throw new Error("Expected a thin little-endian arm64 Mach-O executable.");
  const count = header.readUInt32LE(16);
  const bytes = header.readUInt32LE(20);
  if (
    count < 1 ||
    count > 4096 ||
    bytes < 8 ||
    bytes > 1024 * 1024 ||
    bytes % 8 !== 0
  )
    throw new Error("Invalid Mach-O load command bounds.");
  return { count, bytes };
}

/** Validate the complete command table and every fixed slot before any write. */
export function planRuntimeLoadPathEdits(header, commands, options) {
  const { count, bytes } = commandBounds(header);
  if (!Buffer.isBuffer(commands) || commands.length !== bytes)
    throw new Error("Truncated or inconsistent Mach-O load commands.");
  const toolchainRoots = roots(options?.toolchainRoots, "toolchain");
  const rpathRoots = roots(options?.rpathRoots ?? toolchainRoots, "RPATH");
  const expectedLibpq = new Set(
    toolchainRoots.map((root) =>
      posix.join(root, "postgres/lib/libpq.5.dylib"),
    ),
  );
  const edits = [];
  const dependencies = [];
  const rpaths = [];
  let offset = 0;
  let libpqImports = 0;
  for (let index = 0; index < count; index++) {
    if (offset + 8 > bytes) throw new Error("Truncated Mach-O command.");
    const kind = commands.readUInt32LE(offset);
    const size = commands.readUInt32LE(offset + 4);
    if (size < 8 || size % 8 !== 0 || offset + size > bytes)
      throw new Error("Invalid Mach-O command size.");
    const dylib = importCommands.has(kind) || kind === 0xd;
    if (dylib || kind === 0x8000001c) {
      const minimum = dylib ? 24 : 12;
      if (size < minimum + 1) throw new Error("Invalid Mach-O path command.");
      const relative = commands.readUInt32LE(offset + 8);
      const start = offset + relative;
      const end = offset + size;
      if (relative < minimum || start >= end)
        throw new Error("Invalid Mach-O path offset.");
      const zero = commands.indexOf(0, start);
      if (zero < start || zero >= end)
        throw new Error("Unterminated Mach-O path.");
      const original = new TextDecoder("utf-8", { fatal: true }).decode(
        commands.subarray(start, zero),
      );
      if (!original || /[\0-\x1f\x7f]/.test(original))
        throw new Error("Invalid Mach-O path string.");
      let replacement;
      if (importCommands.has(kind)) {
        dependencies.push(original);
        if (/^libpq(?:\.\d+)*\.dylib$/.test(posix.basename(original))) {
          if (
            kind !== 0xc ||
            !(
              expectedLibpq.has(original) ||
              original === "@rpath/libpq.5.dylib" ||
              original === persistentLibpq
            )
          )
            throw new Error(
              `Unrecognized libpq import outside the configured toolchain: ${original}.`,
            );
          libpqImports++;
          if (original !== persistentLibpq) replacement = persistentLibpq;
        } else if (rpathRoots.some((root) => inside(original, root)))
          throw new Error(
            `A non-libpq import still depends on a private build root: ${original}.`,
          );
      } else if (kind === 0x8000001c) {
        rpaths.push(original);
        if (rpathRoots.some((root) => inside(original, root))) {
          if (posix.normalize(original) !== original)
            throw new Error(
              "A private Mach-O RPATH must not traverse outside its bounded root.",
            );
          replacement = persistentRpath;
        }
      }
      if (replacement) {
        if (Buffer.byteLength(replacement) + 1 > end - start)
          throw new Error(
            "A persistent Mach-O path does not fit its original slot.",
          );
        edits.push({
          offset: 32 + start,
          length: end - start,
          original,
          replacement,
          kind: kind === 0x8000001c ? "rpath" : "dylib",
        });
      }
    }
    offset += size;
  }
  if (offset !== bytes)
    throw new Error(
      "The Mach-O command count does not cover its complete table.",
    );
  if (libpqImports !== 1)
    throw new Error(
      `Expected exactly one configured libpq import; found ${libpqImports}.`,
    );
  return { edits, dependencies, rpaths };
}

export async function rewriteRuntimeLoadPaths(path, options) {
  const handle = await open(path, "r+");
  try {
    const header = Buffer.alloc(32);
    if ((await handle.read(header, 0, 32, 0)).bytesRead !== 32)
      throw new Error("Truncated Mach-O header.");
    const { bytes } = commandBounds(header);
    const commands = Buffer.alloc(bytes);
    if ((await handle.read(commands, 0, bytes, 32)).bytesRead !== bytes)
      throw new Error("Truncated Mach-O load commands.");
    const plan = planRuntimeLoadPathEdits(header, commands, options);
    // The planner is pure: no executable/header bytes are touched until all
    // commands, exactly one libpq import and every replacement have passed.
    for (const edit of plan.edits) {
      const slot = Buffer.alloc(edit.length);
      slot.write(edit.replacement, "utf8");
      if (
        (await handle.write(slot, 0, slot.length, edit.offset)).bytesWritten !==
        slot.length
      )
        throw new Error("Incomplete Mach-O path write.");
    }
    await handle.sync();
    return plan;
  } finally {
    await handle.close();
  }
}
