// PostgreSQL 14.15 detects host libc functions that its older macOS target
// cannot use. Keep its existing fallback without changing the deployment target.
export function postgresConfigureEnvironment(environment, platform = process.platform) {
  return platform === "darwin"
    ? { ...environment, ac_cv_func_strchrnul: "no" }
    : { ...environment };
}

const originalFallback = "#ifndef HAVE_STRCHRNUL\n\nstatic inline const char *\nstrchrnul(const char *s, int c)\n";
const compatibleFallback = "#ifndef HAVE_STRCHRNUL\n\n/* Avoid the SDK declaration unavailable below macOS 15.4. */\n#define strchrnul pg_strchrnul\n\nstatic inline const char *\nstrchrnul(const char *s, int c)\n";

export function postgresSnprintfSource(source, platform = process.platform) {
  if (platform !== "darwin") return source;
  const originalCount = source.split(originalFallback).length - 1;
  const compatibleCount = source.split(compatibleFallback).length - 1;
  if (compatibleCount === 1 && originalCount === 0) return source;
  if (originalCount !== 1 || compatibleCount !== 0)
    throw new Error("Pinned PostgreSQL snprintf fallback differs from the reviewed macOS compatibility patch.");
  // As in upstream's Sequoia fix, define this after the system includes so the
  // private fallback cannot collide with the SDK's unavailable declaration.
  return source.replace(originalFallback, compatibleFallback);
}
