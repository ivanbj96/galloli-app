// workers/fcm-send.js
// Endpoint para enviar comandos al APK via FCM HTTP v1
// POST /fcm/send  { token, type, ...payload }
// Auth: Bearer JWT del usuario (mismo que el resto de la API)

export async function handleFcmSend(request, env) {
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }

    let body;
    try { body = await request.json(); } catch {
        return new Response('Bad JSON', { status: 400 });
    }

    const { token, type, ...rest } = body || {};
    if (!token || !type) {
        return new Response('Missing token/type', { status: 400 });
    }

    try {
        const accessToken = await getAccessToken(env);
        const projectId = env.FCM_PROJECT_ID;

        if (!projectId) {
            return new Response('FCM_PROJECT_ID not configured', { status: 500 });
        }

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
                        data: {
                            type,
                            ...Object.fromEntries(
                                Object.entries(rest).map(([k, v]) => [k, String(v)])
                            )
                        },
                        android: { priority: 'HIGH' },
                    },
                }),
            }
        );

        const out = await fcmRes.text();
        return new Response(out, {
            status: fcmRes.status,
            headers: { 'content-type': 'application/json' }
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), {
            status: 500,
            headers: { 'content-type': 'application/json' }
        });
    }
}

// ─── OAuth2 JWT para FCM HTTP v1 ─────────────────────────────────────────────
async function getAccessToken(env) {
    if (!env.FCM_SERVICE_ACCOUNT_JSON) {
        throw new Error('FCM_SERVICE_ACCOUNT_JSON secret not set');
    }
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
        { name: 'RSASSA-PKCS1-v1_5' }, key,
        new TextEncoder().encode(toSign)
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
        false, ['sign']
    );
}

const btoaUrl = (s) => btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
const btoaUrlBuf = (buf) => btoaUrl(String.fromCharCode(...new Uint8Array(buf)));
