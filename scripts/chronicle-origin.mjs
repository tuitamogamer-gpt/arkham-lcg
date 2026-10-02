// The local game service accepts Chronicle's own published app and local
// development clients. An unrelated website cannot open the private API.
export const publishedChronicleOrigin = 'https://arkham-lcg.vercel.app';
export function chronicleOriginAllowed(origin) {
  if (!origin) return true;
  try {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password) return false;
    return url.origin === publishedChronicleOrigin ||
      url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  } catch { return false; }
}
