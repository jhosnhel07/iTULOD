// =============================================================================
// iTULOD Edge Function: paymongo-webhook
// -----------------------------------------------------------------------------
// Receives server-to-server events from PayMongo and is the *source of
// truth* for whether a booking got paid — never trust the browser alone,
// since a shopper can close the tab before redirect flows complete.
//
// Register this URL in PayMongo Dashboard -> Developers -> Webhooks:
//   https://<project-ref>.functions.supabase.co/paymongo-webhook
// Events to subscribe to: source.chargeable, payment.paid, payment.failed,
//   payment_intent.succeeded, payment_intent.payment_failed
//
// Deploy:  supabase functions deploy paymongo-webhook --no-verify-jwt
// (--no-verify-jwt because PayMongo calls this anonymously; we verify the
// PayMongo signature ourselves below instead of a Supabase JWT.)
// =============================================================================
import { adminClient, json, paymongoFetch, TABLE_BY_KIND, CORS_HEADERS } from '../_shared/helpers.ts';

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

// Look up which booking table + row a PayMongo reference (source id or
// payment_intent id) belongs to.
async function findBookingByReference(admin: ReturnType<typeof adminClient>, reference: string) {
  for (const [kind, table] of Object.entries(TABLE_BY_KIND)) {
    const { data } = await admin.from(table).select('id, payment_status').eq('paymongo_reference', reference).maybeSingle();
    if (data) return { kind, table, booking: data };
  }
  return null;
}

async function markPaid(admin: ReturnType<typeof adminClient>, reference: string) {
  const hit = await findBookingByReference(admin, reference);
  if (!hit) return;
  if (hit.booking.payment_status === 'paid') return; // idempotent
  await admin.from(hit.table).update({ payment_status: 'paid' }).eq('id', hit.booking.id);
}

async function markFailed(admin: ReturnType<typeof adminClient>, reference: string) {
  const hit = await findBookingByReference(admin, reference);
  if (!hit) return;
  await admin.from(hit.table).update({ payment_status: 'failed' }).eq('id', hit.booking.id);
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
        // Actually charge the now-chargeable GCash source.
        await paymongoFetch('/payments', secretKey, {
          method: 'POST',
          body: JSON.stringify({
            data: { attributes: { amount, currency: 'PHP', source: { id: sourceId, type: 'source' }, description: 'iTULOD booking' } }
          })
        });
        await markPaid(admin, sourceId);
        break;
      }
      case 'payment.paid': {
        const sourceId = resource.attributes?.source?.id;
        if (sourceId) await markPaid(admin, sourceId);
        break;
      }
      case 'payment.failed': {
        const sourceId = resource.attributes?.source?.id;
        if (sourceId) await markFailed(admin, sourceId);
        break;
      }
      case 'payment_intent.succeeded': {
        await markPaid(admin, resource.id);
        break;
      }
      case 'payment_intent.payment_failed': {
        await markFailed(admin, resource.id);
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
