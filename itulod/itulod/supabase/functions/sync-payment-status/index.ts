// =============================================================================
// iTULOD Edge Function: sync-payment-status
// -----------------------------------------------------------------------------
// paymongo-webhook is the real source of truth for a payment — but it's
// pushed to us by PayMongo asynchronously, so there's an unavoidable gap
// between "the shopper authorized GCash" and "our database says paid". This
// function closes that gap from the other end: instead of waiting on the
// webhook, the customer's browser can ask PayMongo directly, right when it
// matters (the payment-return page, or the dashboard after "Back to
// dashboard").
//
// Deliberately READ-ONLY against PayMongo — it only ever checks a Source's
// status and syncs our DB to match. It never creates a Payment (never
// charges anything). That stays paymongo-webhook's job exclusively, so there
// is no way this function can cause a double charge.
//
//   POST { booking_type: 'transport'|'food'|'parcel', booking_id }
//
// Deploy: supabase functions deploy sync-payment-status
// =============================================================================
import { adminClient, getRequestUser, json, paymongoFetch, TABLE_BY_KIND, CORS_HEADERS } from '../_shared/helpers.ts';
import { markBookingPaid, markBookingFailed } from '../_shared/payments.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { booking_type, booking_id } = await req.json();
    const table = TABLE_BY_KIND[booking_type];
    if (!table) return json({ error: 'Unknown booking_type.' }, 400);

    const admin = adminClient();
    const { data: booking, error } = await admin
      .from(table)
      .select('customer_id, payment_status, paymongo_reference')
      .eq('id', booking_id)
      .single();
    if (error || !booking) return json({ error: 'Booking not found.' }, 404);
    if (booking.customer_id !== user.id) return json({ error: 'This booking does not belong to you.' }, 403);

    // Already resolved, or never went through GCash — nothing to check.
    if (booking.payment_status === 'paid' || booking.payment_status === 'failed' || !booking.paymongo_reference) {
      return json({ payment_status: booking.payment_status });
    }

    const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY')!;
    let source;
    try {
      source = await paymongoFetch(`/sources/${booking.paymongo_reference}`, secretKey);
    } catch (e) {
      // PayMongo hiccup — stay quiet and report whatever we already have;
      // the webhook (or the next poll) gets another chance.
      console.error('PayMongo source lookup failed:', e);
      return json({ payment_status: booking.payment_status });
    }

    const sourceStatus = source?.data?.attributes?.status;
    if (sourceStatus === 'paid') {
      await markBookingPaid(admin, booking.paymongo_reference);
      return json({ payment_status: 'paid' });
    }
    if (sourceStatus === 'failed' || sourceStatus === 'expired' || sourceStatus === 'cancelled') {
      await markBookingFailed(admin, booking.paymongo_reference);
      return json({ payment_status: 'failed' });
    }

    return json({ payment_status: booking.payment_status }); // still pending — webhook hasn't landed yet
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
