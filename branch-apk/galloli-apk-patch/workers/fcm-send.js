// workers/fcm-send.js
//
// Endpoint Cloudflare Worker para enviar comandos al APK vía FCM HTTP v1.
//
// Setup:
//   1. En Firebase Console → Project settings → Service accounts → Generate
//      private key. Guárdala como secret en Cloudflare:
//         wrangler secret put FCM_SERVICE_ACCOUNT_JSON
//   2. Mete el FCM project id como variable: FCM_PROJECT_ID
//   3. Añade ruta en wrangler.toml.
//
// POST /fcm/send  { token, type, ...payload }
//
// Auth: cabecera X-Galloli-Admin con un token aleatorio (guarda en
// ADMIN_TOKEN secret). NO uses contraseñas largas en URL.

export default {
  async fetch(req, env) {
    if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

    const adminTok = req.headers.get('x-galloli-admin');
    if (!adminTok || adminTok !== env.ADMIN_TOKEN) {
      return new Response('Unauthorized', { status: 401 });
    }

    let body;
    try { body = await req.json(); } catch { return new Response('Bad JSON', { status: 400 }); }

    const { token, type, ...rest } = body || {};
    if (!token || !type) return new Response('Missing token/type', { status: 400 });

    const accessToken = await getAccessToken(env);
    const projectId = env.FCM_PROJECT_ID;

    const fcmRes = await fetch(
      `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data: { type, ...Object.fromEntries(Object.entries(rest).map(([k,v]) => [k, String(v)])) },
            android: { priority: 'HIGH' },
          },
        }),
      },
    );

    const out = await fcmRes.text();
    return new Response(out, { status: fcmRes.status, headers: { 'content-type': 'application/json' } });
  },
};

// ---- helpers: OAuth2 JWT para FCM HTTP v1 ----
async function getAccessToken(env) {
  const sa = JSON.parse(env.FCM_SERVICE_ACCOUNT_JSON);
  const now = Math.floor(Date.now() / 1000);
  const header = btoaUrl(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = btoaUrl(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const toSign = `${header}.${claims}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(toSign),
  );
  const jwt = `${toSign}.${btoaUrlBuf(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  return data.access_token;
}

async function importPrivateKey(pem) {
  const pkcs8 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s/g, '');
  const bin = Uint8Array.from(atob(pkcs8), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'pkcs8', bin.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign'],
  );
}

const btoaUrl = (s) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const btoaUrlBuf = (buf) => btoaUrl(String.fromCharCode(...new Uint8Array(buf)));
