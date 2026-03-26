/**
 * MultiSet M2M Authentication
 * POST /v1/m2m/token with Basic auth header.
 */

const TOKEN_URL = '/api/multiset/v1/m2m/token';

/**
 * Obtain a JWT bearer token from MultiSet.
 * @param {string} clientId
 * @param {string} clientSecret
 * @returns {Promise<{token: string, expiresAt: number}>}
 */
export async function getM2MToken(clientId, clientSecret) {
  const basicCredentials = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicCredentials}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId,
      clientSecret,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Auth failed (${res.status}): ${body || res.statusText}`);
  }

  const data = await res.json();

  // The response may vary — common shapes: { token, expiresAt } or { access_token, expires_in }
  const token = data.token || data.access_token;
  const expiresAt = data.expiresAt || (data.expires_in ? Date.now() + data.expires_in * 1000 : 0);

  if (!token) {
    throw new Error('Auth response did not contain a token');
  }

  return { token, expiresAt };
}
