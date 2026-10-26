// Firebase Cloud Messaging (HTTP v1) for the Android app — used by send-push.
//
// Secret: FIREBASE_SERVICE_ACCOUNT_B64 = the Firebase service-account JSON
// (Project settings → Service accounts → Generate new private key), base64
// encoded so it fits in one env line. Never commit that file.

type ServiceAccount = { project_id: string; client_email: string; private_key: string; token_uri?: string };

let account: ServiceAccount | null | undefined;
let cachedToken: { value: string; expires: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  if (account !== undefined) return account;
  const b64 = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_B64');
  try {
    account = b64 ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0)))) : null;
  } catch (e) {
    console.error('FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64 JSON', e);
    account = null;
  }
  return account;
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

const b64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// OAuth access token for the FCM scope, from a JWT signed with the service
// account key. Google tokens last an hour; reuse one until shortly before.
async function accessToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expires > now + 60) return cachedToken.value;

  const tokenUri = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    'pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)),
  );
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  const body = await res.json();
  if (!res.ok || !body.access_token) throw new Error(`FCM auth failed: ${res.status} ${JSON.stringify(body)}`);
  cachedToken = { value: body.access_token, expires: now + Number(body.expires_in || 3600) };
  return cachedToken.value;
}

/**
 * Sends one notification to one device. Returns 'sent', 'invalid' (the token
 * is dead — the caller should delete it) or 'failed'.
 */
export async function sendFcm(
  token: string,
  title: string,
  body: string,
  opts: { validateOnly?: boolean; data?: Record<string, string> } = {},
): Promise<'sent' | 'invalid' | 'failed'> {
  const sa = serviceAccount();
  if (!sa) return 'failed';
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await accessToken(sa)}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        validate_only: !!opts.validateOnly,
        message: {
          token,
          notification: { title, body },
          // e.g. { link: 'messages/ride/<id>' } — the app opens that screen on tap
          ...(opts.data ? { data: opts.data } : {}),
          android: {
            priority: 'HIGH',
            // The app's "Booking updates" channel (AppAlerts in app_itulod).
            notification: { channel_id: 'itulod_updates', sound: 'default' },
          },
        },
      }),
    });
    if (res.ok) return 'sent';
    const err = await res.json().catch(() => ({}));
    const code = err?.error?.details?.find?.((d: { errorCode?: string }) => d.errorCode)?.errorCode || err?.error?.status;
    if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') return 'invalid';
    console.error('FCM send failed', res.status, JSON.stringify(err));
    return 'failed';
  } catch (e) {
    console.error('FCM send error', e);
    return 'failed';
  }
}
