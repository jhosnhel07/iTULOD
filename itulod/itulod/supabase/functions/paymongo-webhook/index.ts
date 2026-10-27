// =============================================================================
// iTULOD Edge Function: paymongo-webhook
// -----------------------------------------------------------------------------
// Receives server-to-server events from PayMongo and is the *source of
// truth* for whether a booking got paid — never trust the browser alone,
// since a shopper can close the tab before redirect flows complete.
//
// Register this URL in PayMongo Dashboard -> Developers -> Webhooks:
//   https://<project-ref>.functions.supabase.co/paymongo-webhook
// Events to subscribe to: source.chargeable, payment.paid, payment.failed
//
// Deploy:  supabase functions deploy paymongo-webhook --no-verify-jwt
// (--no-verify-jwt because PayMongo calls this anonymously; we verify the
// PayMongo signature ourselves below instead of a Supabase JWT.)
// =============================================================================
import { adminClient, json, CORS_HEADERS } from '../_shared/helpers.ts';
import {
  chargeSource, markBookingPaid, markBookingFailed, markWalletTopupPaid, markWalletTopupFailed,
  markRiderPaymentPaid, markRiderPaymentFailed,
} from '../_shared/payments.ts';

// A PayMongo reference funds a booking, a wallet top-up, or a rider paying
// what they owe iTULOD — try them in that order, so each reference is settled
// exactly once.
async function settlePaid(admin: ReturnType<typeof adminClient>, reference: string) {
  if (await markBookingPaid(admin, reference)) return;
  if (await markWalletTopupPaid(admin, reference)) return;
  await markRiderPaymentPaid(admin, reference);
}
async function settleFailed(admin: ReturnType<typeof adminClient>, reference: string) {
  if (await markBookingFailed(admin, reference)) return;
  if (await markWalletTopupFailed(admin, reference)) return;
  await markRiderPaymentFailed(admin, reference);
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// PayMongo signs webhooks as: "Paymongo-Signature: t=<ts>,te=<test_sig>,li=<live_sig>"
// signed payload = `${ts}.${rawBody}`. We accept a match against either the
// test or live signature so the same function works with a test-mode secret.
async function verifySignature(rawBody: string, header: string | null, secret: string) {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')) as [string, string][]);
  if (!parts.t) return false;
  const expected = await hmacSha256Hex(secret, `${parts.t}.${rawBody}`);
  return expected === parts.te || expected === parts.li;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  const rawBody = await req.text();
  const webhookSecret = Deno.env.get('PAYMONGO_WEBHOOK_SECRET')!;
  const signatureHeader = req.headers.get('Paymongo-Signature');

  const valid = await verifySignature(rawBody, signatureHeader, webhookSecret);
  if (!valid) return json({ error: 'Invalid signature.' }, 401);

  try {
    const event = JSON.parse(rawBody);
    const type = event?.data?.attributes?.type;
    const resource = event?.data?.attributes?.data;
    const admin = adminClient();

    switch (type) {
      case 'source.chargeable': {
        const sourceId = resource.id;
        const amount = resource.attributes.amount;
        const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY')!;
        // Charge the now-chargeable GCash source (sync-payment-status may
        // already have — chargeSource then just reads the outcome).
        const outcome = await chargeSource(sourceId, amount, secretKey, 'iTULOD booking');
        if (outcome === 'paid') await settlePaid(admin, sourceId);
        else if (outcome === 'failed') await settleFailed(admin, sourceId);
        break;
      }
      case 'payment.paid': {
        const sourceId = resource.attributes?.source?.id;
        if (sourceId) await settlePaid(admin, sourceId);
        break;
      }
      case 'payment.failed': {
        const sourceId = resource.attributes?.source?.id;
        if (sourceId) await settleFailed(admin, sourceId);
        break;
      }
      case 'payment_intent.succeeded': {
        // Legacy: only fires for card intents created before card checkout was
        // removed. Kept so any in-flight one still settles correctly.
        await markBookingPaid(admin, resource.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        await markBookingFailed(admin, resource.id);
        break;
      }
      default:
        // Ignore event types we don't act on.
        break;
    }

    return json({ received: true });
  } catch (err) {
    console.error(err);
    return json({ error: 'Webhook processing error.' }, 500);
  }
});
