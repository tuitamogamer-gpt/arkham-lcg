import test from 'node:test';
import assert from 'node:assert/strict';
import { chronicleOriginAllowed } from '../scripts/chronicle-origin.mjs';

test('the published Chronicle can reach its loopback game service, while unrelated sites cannot', () => {
  for (const origin of [undefined, 'http://localhost:5187', 'http://127.0.0.1:5193', 'http://[::1]:5187', 'https://arkham-lcg.vercel.app']) assert.equal(chronicleOriginAllowed(origin), true, String(origin));
  for (const origin of ['https://evil.example', 'https://arkham-lcg.vercel.app.evil.example', 'https://evil-arkham-lcg.vercel.app', 'http://arkham-lcg.vercel.app', 'https://localhost:5187', 'http://user@localhost:5187', 'http://localhost:5187/path', 'null']) assert.equal(chronicleOriginAllowed(origin), false, origin);
});
