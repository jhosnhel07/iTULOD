// =============================================================================
// create-payment — SELF-CONTAINED build for Dashboard paste-deploy
// -----------------------------------------------------------------------------
// This is supabase/functions/create-payment/index.ts with _shared/helpers.ts
// inlined, so it can be pasted into the Supabase Dashboard editor
// (Edge Functions -> Deploy a new function -> Via Editor), which has no
// _shared/ sibling to import from.
//
// ⚠ DUPLICATE LOGIC. The canonical source is
// supabase/functions/create-payment/index.ts + _shared/helpers.ts. If you edit
// one, edit the other. Prefer the CLI (`supabase functions deploy`) for real
// deploys — the Dashboard editor has no versioning or rollback.
//
// Leave "Verify JWT" ENABLED for this function: it is called by a logged-in
// customer and checks their session token.
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

// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically by the
// platform — no secret needs to be set for these.
function adminClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    Deno.env.get('SUPABASE_SECRET_KEY');
  if (!key) throw new Error('No service-role key available to the function.');
  return createClient(url, key);
}

async function getRequestUser(req: Request) {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '');
  if (!token) return null;

  const supabase = adminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
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

function toCentavos(amount: number) {
  return Math.round(Number(amount) * 100);
}

// ---- handler ---------------------------------------------------------------

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { booking_type, booking_id, method } = await req.json();
    if (!TABLE_BY_KIND[booking_type]) return json({ error: 'Unknown booking_type.' }, 400);
    if (method !== 'gcash') return json({ error: 'method must be gcash.' }, 400);

    const table = TABLE_BY_KIND[booking_type];
    const admin = adminClient();

    // Load the booking and make sure it belongs to the caller.
    const { data: booking, error: bookingErr } = await admin
      .from(table)
      .select('id, customer_id, estimated_fare, payment_status')
      .eq('id', booking_id)
      .single();

    if (bookingErr || !booking) return json({ error: 'Booking not found.' }, 404);
    if (booking.customer_id !== user.id) return json({ error: 'This booking does not belong to you.' }, 403);
    if (booking.payment_status === 'paid') return json({ error: 'This booking is already paid.' }, 400);
    if (!booking.estimated_fare || Number(booking.estimated_fare) <= 0) {
      return json({ error: 'Booking has no payable amount yet.' }, 400);
    }

    const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY')!;
    const amount = toCentavos(booking.estimated_fare);
    const siteUrl = Deno.env.get('SITE_URL') || '';

    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).single();

    // `billing` is optional to PayMongo, but if it is present at all then
    // `billing.email` is required — sending only a name gets a 400
    // "billing.email is required." So send the pair or send nothing.
    const billing = user.email
      ? { name: profile?.full_name || 'iTULOD customer', email: user.email }
      : undefined;

    const source = await paymongoFetch('/sources', secretKey, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            amount,
            currency: 'PHP',
            type: 'gcash',
            redirect: {
              success: `${siteUrl}/payment-return.html?type=${booking_type}&id=${booking_id}&result=success`,
              failed: `${siteUrl}/payment-return.html?type=${booking_type}&id=${booking_id}&result=failed`
            },
            ...(billing ? { billing } : {})
          }
        }
      })
    });

    await admin.from(table).update({
      payment_method: 'gcash',
      paymongo_reference: source.data.id
    }).eq('id', booking_id);

    return json({ checkout_url: source.data.attributes.redirect.checkout_url });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
