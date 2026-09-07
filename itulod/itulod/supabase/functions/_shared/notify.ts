// =============================================================================
// iTULOD Edge Functions — notification fan-out
// -----------------------------------------------------------------------------
// notifyUser() writes the in-app notification row (always) and, when the
// matching secrets are configured, also sends an SMS and/or a web-push message.
// Everything except the in-app row is best-effort and never throws.
//
// Optional secrets (set with `supabase secrets set ...`):
//   SEMAPHORE_API_KEY      PH SMS gateway (https://semaphore.co) — enables SMS
//   SEMAPHORE_SENDER_NAME  registered sender name (default "iTULOD")
//   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT  — enables web push
// =============================================================================
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type NotifyOpts = { title: string; message: string; sms?: boolean; push?: boolean };

export async function notifyUser(admin: SupabaseClient, userId: string, opts: NotifyOpts) {
  const { title, message, sms = true, push = true } = opts;

  // 1. in-app — the one channel that must succeed
  await admin.from('notifications').insert({ user_id: userId, title, message });

  // 2. SMS (Semaphore) — needs the phone on the profile + an API key
  if (sms && Deno.env.get('SEMAPHORE_API_KEY')) {
    try {
      const { data: p } = await admin.from('profiles').select('phone').eq('id', userId).single();
      const number = normalizePH(p?.phone);
      if (number) {
        await fetch('https://api.semaphore.co/api/v4/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apikey: Deno.env.get('SEMAPHORE_API_KEY'),
            number,
            message: `${title}\n${message}`,
            sendername: Deno.env.get('SEMAPHORE_SENDER_NAME') || 'iTULOD',
          }),
        });
      }
    } catch (e) {
      console.error('SMS send failed', e);
    }
  }

  // 3. Web push — needs VAPID keys + a saved subscription
  if (push && Deno.env.get('VAPID_PRIVATE_KEY')) {
    try {
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth')
        .eq('user_id', userId);
      for (const s of subs ?? []) {
        await sendWebPush(s, JSON.stringify({ title, body: message, url: '/customer/dashboard.html' }))
          .catch((e) => console.error('push send failed', e));
      }
    } catch (e) {
      console.error('push lookup failed', e);
    }
  }
}

function normalizePH(v: string | null | undefined) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return '63' + d.slice(1);   // Semaphore wants 639XXXXXXXXX
  if (/^639\d{9}$/.test(d)) return d;
  return null;
}

// Minimal VAPID web-push. Uses the `web-push` port on esm.sh so we don't
// hand-roll the ECDH/HKDF crypto.
async function sendWebPush(sub: { endpoint: string; p256dh: string; auth: string }, payload: string) {
  const webpush = await import('https://esm.sh/web-push@3.6.7');
  webpush.setVapidDetails(
    Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@itulod.local',
    Deno.env.get('VAPID_PUBLIC_KEY')!,
    Deno.env.get('VAPID_PRIVATE_KEY')!,
  );
  await webpush.sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload,
  );
}
