// =============================================================================
// iTULOD Edge Function: finalize-fare
// -----------------------------------------------------------------------------
// Called by the assigned RIDER at pickup for a food / parcel delivery, where
// the fare isn't known until they see the order. Validates the amount against
// platform_config, writes final_fare (service role -> bypasses the client
// guard trigger), and notifies the customer.
//
//   POST { booking_type: 'food'|'parcel', booking_id, amount }
//
// Deploy: supabase functions deploy finalize-fare
// =============================================================================
import { adminClient, getRequestUser, json, TABLE_BY_KIND, CORS_HEADERS } from '../_shared/helpers.ts';
import { notifyUser } from '../_shared/notify.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { booking_type, booking_id, amount } = await req.json();
    const table = TABLE_BY_KIND[booking_type];
    if (!table || booking_type === 'transport') {
      return json({ error: 'finalize-fare is for food / parcel deliveries only.' }, 400);
    }
    const value = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(value) || value <= 0) return json({ error: 'Enter a valid amount.' }, 400);

    const admin = adminClient();
    const { data: booking } = await admin
      .from(table)
      .select('id, rider_id, customer_id, estimated_fare, final_fare, status')
      .eq('id', booking_id)
      .single();

    if (!booking) return json({ error: 'Booking not found.' }, 404);
    if (booking.rider_id !== user.id) return json({ error: 'You are not the rider for this booking.' }, 403);
    if (!['accepted', 'ongoing'].includes(booking.status)) {
      return json({ error: 'Fare can only be set on an active booking.' }, 400);
    }

    const { data: cfg } = await admin.from('platform_config').select('*').single();
    const est = Number(booking.estimated_fare ?? 0);
    if (est > 0) {
      const max = est * Number(cfg?.fare_max_multiplier ?? 3);
      const min = Math.max(Number(cfg?.fare_min ?? 20), est * 0.5);
      if (value > max) return json({ error: `That's more than ${cfg?.fare_max_multiplier ?? 3}x the estimate (₱${est.toFixed(2)}).` }, 400);
      if (value < min) return json({ error: `That's below the minimum (₱${min.toFixed(2)}).` }, 400);
    }

    await admin.from(table).update({ final_fare: value }).eq('id', booking_id);

    await notifyUser(admin, booking.customer_id, {
      title: 'Delivery fare confirmed',
      message: `Your rider set the fare for this delivery to ₱${value.toFixed(2)}.`,
    });

    return json({ ok: true, final_fare: value });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
