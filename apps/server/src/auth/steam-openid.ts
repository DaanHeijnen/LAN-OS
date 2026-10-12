// "Sign in through Steam" (OpenID 2.0). Steam confirms the Steam ID; no password reaches LAN OS.
const STEAM_OPENID = 'https://steamcommunity.com/openid/login';
const IDENTIFIER_SELECT = 'http://specs.openid.net/auth/2.0/identifier_select';
const CLAIMED_ID = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function steamSignInUrl(returnTo: string, realm: string): string {
  const params = new URLSearchParams({
    'openid.ns': 'http://specs.openid.net/auth/2.0',
    'openid.mode': 'checkid_setup',
    'openid.return_to': returnTo,
    'openid.realm': realm,
    'openid.identity': IDENTIFIER_SELECT,
    'openid.claimed_id': IDENTIFIER_SELECT,
  });
  return `${STEAM_OPENID}?${params}`;
}

/**
 * Checks Steam's answer with Steam itself and returns the verified 64-bit Steam ID.
 * `expectedReturnTo` guards against answers meant for another site.
 */
export async function verifySteamSignIn(query: Record<string, string>, expectedReturnTo: string,
  fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (query['openid.mode'] !== 'id_res') return null;
  const returnTo = query['openid.return_to'] ?? '';
  if (returnTo.split('?')[0] !== expectedReturnTo.split('?')[0]) return null;
  const match = CLAIMED_ID.exec(query['openid.claimed_id'] ?? '');
  if (!match) return null;

  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (key.startsWith('openid.')) body.set(key, value);
  body.set('openid.mode', 'check_authentication');
  const response = await fetchImpl(STEAM_OPENID, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  return /^is_valid\s*:\s*true\s*$/m.test(text) ? match[1]! : null;
}
