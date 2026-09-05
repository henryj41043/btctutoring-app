import {jwtExpiresWithin, jwtExpiry} from './jwt';

/** A structurally valid (unsigned) JWT with the given payload. */
const token = (payload: Record<string, unknown>): string =>
  `h.${btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.sig`;

describe('jwt utils', () => {
  const now = new Date('2026-09-05T12:00:00Z');
  const at = (secondsFromNow: number): number => Math.floor(now.getTime() / 1000) + secondsFromNow;

  it('reads a numeric exp claim, tolerating base64url characters', () => {
    expect(jwtExpiry(token({exp: 1234567890, username: 'a?b>c'}))).toBe(1234567890);
  });

  it('returns null for missing, malformed, or exp-less tokens', () => {
    expect(jwtExpiry(null)).toBeNull();
    expect(jwtExpiry('')).toBeNull();
    expect(jwtExpiry('not-a-jwt')).toBeNull();
    expect(jwtExpiry('h.%%%not-base64%%%.s')).toBeNull();
    expect(jwtExpiry(token({sub: 'x'}))).toBeNull();
    expect(jwtExpiry(token({exp: 'soon'}))).toBeNull();
  });

  it('expiresWithin: true inside the window, false outside, boundary inclusive', () => {
    expect(jwtExpiresWithin(token({exp: at(30)}), 60, now)).toBe(true);
    expect(jwtExpiresWithin(token({exp: at(-5)}), 60, now)).toBe(true); // already expired
    expect(jwtExpiresWithin(token({exp: at(60)}), 60, now)).toBe(true); // exactly at the edge
    expect(jwtExpiresWithin(token({exp: at(61)}), 60, now)).toBe(false);
    expect(jwtExpiresWithin(token({exp: at(3600)}), 60, now)).toBe(false);
  });

  it('treats an unreadable token as expiring (refresh rather than a doomed request)', () => {
    expect(jwtExpiresWithin('garbage', 60, now)).toBe(true);
    expect(jwtExpiresWithin(null, 60, now)).toBe(true);
  });
});
