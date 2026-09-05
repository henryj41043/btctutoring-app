/**
 * Reads the `exp` claim (seconds since epoch) from a JWT without verifying
 * it — the app only needs to know when Cognito will stop accepting the
 * token, verification is the backend's job. Returns null for anything that
 * isn't a well-formed JWT with a numeric exp.
 */
export function jwtExpiry(token: string | null | undefined): number | null {
  if (!token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(base64)) as {exp?: unknown};
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/**
 * True when the token expires within `withinSeconds` from `now` (or is
 * unreadable — an unreadable token is treated as expired so a refresh is
 * attempted rather than a doomed request).
 */
export function jwtExpiresWithin(
  token: string | null | undefined,
  withinSeconds: number,
  now: Date = new Date(),
): boolean {
  const exp = jwtExpiry(token);
  if (exp === null) {
    return true;
  }
  return exp * 1000 - now.getTime() <= withinSeconds * 1000;
}
