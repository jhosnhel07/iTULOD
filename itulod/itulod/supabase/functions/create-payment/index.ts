// =============================================================================
// iTULOD Edge Function: create-payment
// -----------------------------------------------------------------------------
// Called from the customer dashboard right after a ride/food/parcel booking
// is created with payment_method = 'gcash'.
//
// GCash -> creates a PayMongo Source and returns a checkout_url to redirect
//          to. Actual confirmation arrives later via the paymongo-webhook
//          function when PayMongo sends `source.chargeable`.
//
// GCash is the only online method offered — card checkout was removed, so no
// Payment Intents are created here.
//
// Deploy:  supabase functions deploy create-payment
// Secrets: supabase secrets set --env-file secrets.env
// =============================================================================
import { adminClient, getRequestUser, json, paymongoFetch, TABLE_BY_KIND, toCentavos, CORS_HEADERS } from '../_shared/helpers.ts';

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
