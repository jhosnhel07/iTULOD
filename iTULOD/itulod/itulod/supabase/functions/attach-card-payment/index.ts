// =============================================================================
// iTULOD Edge Function: attach-card-payment
// -----------------------------------------------------------------------------
// The browser tokenizes the card directly with PayMongo using the *public*
// key (js/payment.js) — raw card numbers never touch our server. This
// function only attaches that resulting payment_method_id to the Payment
// Intent created by create-payment, using the *secret* key.
//
// Returns either { status: 'succeeded' } or, if the card requires 3-D
// Secure, { status: 'requires_action', redirect_url } for the browser to
// redirect the shopper to their bank's authentication page.
//
// Deploy:  supabase functions deploy attach-card-payment
// =============================================================================
import { adminClient, getRequestUser, json, paymongoFetch, TABLE_BY_KIND, CORS_HEADERS } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { booking_type, booking_id, payment_intent_id, payment_method_id } = await req.json();
    if (!TABLE_BY_KIND[booking_type]) return json({ error: 'Unknown booking_type.' }, 400);

    const table = TABLE_BY_KIND[booking_type];
    const admin = adminClient();
    const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY')!;
    const siteUrl = Deno.env.get('SITE_URL') || '';

    const { data: booking, error: bookingErr } = await admin
      .from(table).select('customer_id, paymongo_reference, payment_status').eq('id', booking_id).single();
    if (bookingErr || !booking) return json({ error: 'Booking not found.' }, 404);
    if (booking.customer_id !== user.id) return json({ error: 'This booking does not belong to you.' }, 403);
    if (booking.paymongo_reference !== payment_intent_id) return json({ error: 'Payment intent mismatch.' }, 400);
    if (booking.payment_status === 'paid') return json({ status: 'succeeded' });

    const result = await paymongoFetch(`/payment_intents/${payment_intent_id}/attach`, secretKey, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            payment_method: payment_method_id,
            client_key: undefined, // not required for server-side attach
            return_url: `${siteUrl}/payment-return.html?type=${booking_type}&id=${booking_id}&result=3ds`
          }
        }
      })
    });

    const status = result.data.attributes.status; // succeeded | awaiting_next_action | processing | ...

    if (status === 'succeeded') {
      await admin.from(table).update({ payment_status: 'paid' }).eq('id', booking_id);
      return json({ status: 'succeeded' });
    }

    if (status === 'awaiting_next_action') {
      const redirectUrl = result.data.attributes.next_action?.redirect?.url;
      return json({ status: 'requires_action', redirect_url: redirectUrl });
    }

    return json({ status });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
