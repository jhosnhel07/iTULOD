// =============================================================================
// iTULOD Edge Function: send-push
// -----------------------------------------------------------------------------
// Called by the database (sql/023 push_new_notification(), via pg_net) for
// every new row in `notifications` — booking status, chat, fare confirmed,
// refunds… Delivers it as a web push to each of the user's saved browser
// subscriptions, and as an SMS when Semaphore is configured.
//
//   POST { notification_id }   header  x-hook-secret: <PUSH_HOOK_SECRET>
//
// Secrets: PUSH_HOOK_SECRET (must match Vault 'push_hook_secret'),
//          VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT,
//          optional SEMAPHORE_API_KEY / SEMAPHORE_SENDER_NAME.
//
// Deploy: supabase functions deploy send-push --no-verify-jwt
// =============================================================================
import { adminClient, json, CORS_HEADERS } from '../_shared/helpers.ts';

const DASHBOARD_BY_ROLE: Record<string, string> = {
  customer: '/customer/dashboard.html',
  rider: '/rider/dashboard.html',
  admin: '/admin/dashboard.html',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const secret = Deno.env.get('PUSH_HOOK_SECRET');
  if (!secret || req.headers.get('x-hook-secret') !== secret) {
    return json({ error: 'Forbidden.' }, 403);
  }

  try {
    const { notification_id } = await req.json();
    if (!notification_id) return json({ error: 'notification_id is required.' }, 400);

    const admin = adminClient();
    const { data: n } = await admin
      .from('notifications')
      .select('id, user_id, title, message')
      .eq('id', notification_id)
      .maybeSingle();
    if (!n) return json({ error: 'Notification not found.' }, 404);

    const { data: profile } = await admin
      .from('profiles')
      .select('role, phone')
      .eq('id', n.user_id)
      .maybeSingle();
    const url = DASHBOARD_BY_ROLE[profile?.role ?? 'customer'] ?? '/';

    let pushed = 0;
    let removed = 0;
    if (Deno.env.get('VAPID_PRIVATE_KEY') && Deno.env.get('VAPID_PUBLIC_KEY')) {
      const webpush = await import('https://esm.sh/web-push@3.6.7');
      webpush.setVapidDetails(
        Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@itulod.local',
        Deno.env.get('VAPID_PUBLIC_KEY')!,
        Deno.env.get('VAPID_PRIVATE_KEY')!,
      );
      const { data: subs } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth')
        .eq('user_id', n.user_id);
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify({ title: n.title, body: n.message, url }),
          );
          pushed++;
        } catch (e) {
          // 404/410 = the browser dropped this subscription; stop sending to it
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from('push_subscriptions').delete().eq('id', s.id);
            removed++;
          } else {
            console.error('push send failed', status, e);
          }
        }
      }
    }

    // Optional SMS (Semaphore, PH)
    const smsKey = Deno.env.get('SEMAPHORE_API_KEY');
    const number = normalizePH(profile?.phone);
    if (smsKey && number) {
      try {
        await fetch('https://api.semaphore.co/api/v4/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apikey: smsKey,
            number,
            message: `${n.title}\n${n.message}`,
            sendername: Deno.env.get('SEMAPHORE_SENDER_NAME') || 'iTULOD',
          }),
        });
      } catch (e) {
        console.error('SMS send failed', e);
      }
    }

    return json({ ok: true, pushed, removed });
  } catch (err) {
    console.error(err);
    return json({ error: 'processing error' }, 500);
  }
});

function normalizePH(v: string | null | undefined) {
  const d = String(v ?? '').replace(/\D/g, '');
  if (/^09\d{9}$/.test(d)) return '63' + d.slice(1);
  if (/^639\d{9}$/.test(d)) return d;
  return null;
}
