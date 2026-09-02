// =============================================================================
// paymongo-webhook — SELF-CONTAINED build for Dashboard paste-deploy
// -----------------------------------------------------------------------------
// This is supabase/functions/paymongo-webhook/index.ts with _shared/helpers.ts
// inlined, so it can be pasted into the Supabase Dashboard editor
// (Edge Functions -> Deploy a new function -> Via Editor).
//
// ⚠ DUPLICATE LOGIC. Canonical source is
// supabase/functions/paymongo-webhook/index.ts + _shared/helpers.ts. Edit both.
//
// ⚠ You MUST turn "Verify JWT" OFF for this function. PayMongo calls it
// anonymously with no Supabase session token, so with JWT verification on,
// every event is rejected before this code runs and no booking is ever marked
// paid. This function authenticates the caller by verifying PayMongo's own
// HMAC signature instead (verifySignature below).
//
// Register in PayMongo Dashboard -> Developers -> Webhooks:
//   https://ajzlvrvqpggnnwerahhq.functions.supabase.co/paymongo-webhook
// Events: source.chargeable, payment.paid, payment.failed
// =============================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
  });
}

const TABLE_BY_KIND: Record<string, string> = {
  transport: 'transport_bookings',
  food: 'food_deliveries',
  parcel: 'parcel_deliveries'
};

function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_SECRET_KEY');
  if (!key) throw new Error('No service-role key available to the function.');
  return createClient(url, key);
}

async function paymongoFetch(path: string, key: string, init: RequestInit = {}) {
  const res = await fetch(`https://api.paymongo.com/v1${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Basic ' + btoa(`${key}:`),
      ...(init.headers || {})
    }
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.errors?.[0]?.detail || 'PayMongo request failed');
  }
  return body;
}

// ---- signature verification ------------------------------------------------

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

// ---- booking lookup --------------------------------------------------------

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

// ---- handler ---------------------------------------------------------------

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
        // Legacy: only fires for card intents created before card checkout was
        // removed. Kept so any in-flight one still settles correctly.
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
