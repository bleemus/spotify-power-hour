import { describe, expect, it } from 'vitest';
import { decodeState, encodeState, isAllowedReturnOrigin } from './relay';

const PROD = 'https://gentle-sea-0a1b2c3d4.5.azurestaticapps.net';
const DEV = 'http://127.0.0.1:5173';
const allowed = (o: string) => isAllowedReturnOrigin(o, { authOrigin: PROD, devOrigin: DEV });

describe('isAllowedReturnOrigin', () => {
  it('allows production, dev, and this app’s PR previews', () => {
    expect(allowed(PROD)).toBe(true);
    expect(allowed(DEV)).toBe(true);
    expect(allowed('https://gentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net')).toBe(true);
    expect(allowed('https://gentle-sea-0a1b2c3d4-7.westus2.azurestaticapps.net')).toBe(true);
  });

  it('rejects other apps, lookalikes, and non-https', () => {
    for (const o of [
      'https://evil-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net',
      'https://gentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net.evil.com',
      'https://gentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net:8443',
      'http://gentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net',
      'https://gentle-sea-0a1b2c3d4-abc.eastus2.5.azurestaticapps.net',
      'https://xgentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net',
      'https://gentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net/path',
      'https://user@gentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net',
      'http://localhost:5173',
      'javascript:alert(1)',
      '',
    ]) {
      expect(allowed(o), o).toBe(false);
    }
  });

  it('allows no previews when the auth origin is a custom domain and no SWA host is set', () => {
    const cfg = { authOrigin: 'https://powerhour.example.dev', devOrigin: DEV };
    expect(isAllowedReturnOrigin('https://gentle-sea-0a1b2c3d4-12.eastus2.5.azurestaticapps.net', cfg)).toBe(false);
    expect(isAllowedReturnOrigin('https://powerhour.example.dev', cfg)).toBe(true);
  });

  it('with a custom domain, derives previews from the configured SWA host', () => {
    const cfg = {
      authOrigin: 'https://powerhour.example.dev',
      devOrigin: DEV,
      swaHost: 'gentle-sea-0a1b2c3d4.5.azurestaticapps.net',
    };
    const ok = (o: string) => isAllowedReturnOrigin(o, cfg);
    expect(ok('https://powerhour.example.dev')).toBe(true);
    expect(ok('https://gentle-sea-0a1b2c3d4.5.azurestaticapps.net')).toBe(true);
    expect(ok('https://gentle-sea-0a1b2c3d4-3.centralus.5.azurestaticapps.net')).toBe(true);
    expect(ok(DEV)).toBe(true);
    expect(ok('https://other-app-0a1b2c3d4-3.centralus.5.azurestaticapps.net')).toBe(false);
    expect(ok('https://evil.example.dev')).toBe(false);
    expect(ok('http://gentle-sea-0a1b2c3d4.5.azurestaticapps.net')).toBe(false);
  });
});

describe('state encoding', () => {
  it('round-trips', () => {
    const s = { o: PROD, n: 'abc_-123' };
    expect(decodeState(encodeState(s))).toEqual(s);
  });
  it('rejects garbage', () => {
    expect(decodeState('not-base64!!')).toBeNull();
    expect(decodeState(null)).toBeNull();
    expect(decodeState(btoa('{"o":1}'))).toBeNull();
  });
});
