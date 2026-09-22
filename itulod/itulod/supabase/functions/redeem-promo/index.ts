// =============================================================================
// iTULOD Edge Function: redeem-promo
// -----------------------------------------------------------------------------
// Validates a promo code and applies its discount to a booking the customer
// just created. Kept server-side (not a trigger the client can hit directly)
// because "how many times has this code been used" and "has this customer
// already used it" both need to be checked and updated atomically, with no
// way for the client to skip the check.
//
//   POST { code, booking_type: 'transport'|'food'|'parcel', booking_id }
//
// Deploy: supabase functions deploy redeem-promo
// =============================================================================
import { adminClient, getRequestUser, json, TABLE_BY_KIND, CORS_HEADERS } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { code, booking_type, booking_id } = await req.json();
    const table = TABLE_BY_KIND[booking_type];
    if (!table) return json({ error: 'Unknown booking_type.' }, 400);
    // Food/parcel estimated_fare gets replaced by the rider's real, on-the-spot
    // assessment (finalize-fare) — discounting it here would either vanish
    // once that happens or throw off finalize-fare's sanity bounds, which are
    // checked against the (undiscounted) estimate. Ride fares don't have that
    // second step, so promo codes are transport-only until that's addressed.
    if (booking_type !== 'transport') {
      return json({ error: 'Promo codes currently only apply to rides.' }, 400);
    }
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) return json({ error: 'Enter a promo code.' }, 400);

    const admin = adminClient();

    const { data: booking, error: bookingErr } = await admin
      .from(table).select('id, customer_id, estimated_fare, promo_code').eq('id', booking_id).single();
    if (bookingErr || !booking) return json({ error: 'Booking not found.' }, 404);
    if (booking.customer_id !== user.id) return json({ error: 'This booking does not belong to you.' }, 403);
    if (booking.promo_code) return json({ error: 'A promo code has already been applied to this booking.' }, 400);

    const { data: promo, error: promoErr } = await admin
      .from('promo_codes').select('*').ilike('code', normalizedCode).maybeSingle();
    if (promoErr || !promo) return json({ error: 'That promo code was not found.' }, 404);
    if (!promo.active) return json({ error: 'That promo code is no longer active.' }, 400);
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return json({ error: 'That promo code has expired.' }, 400);
    }
    if (promo.max_uses != null && promo.uses_count >= promo.max_uses) {
      return json({ error: 'That promo code has reached its usage limit.' }, 400);
    }
    const fare = Number(booking.estimated_fare || 0);
    if (promo.min_fare && fare < Number(promo.min_fare)) {
      return json({ error: `This code needs a fare of at least ₱${Number(promo.min_fare).toFixed(2)}.` }, 400);
    }

    // One redemption per customer per code — the unique constraint on
    // promo_redemptions is the real enforcement; this just gives a clean
    // error message instead of a raw constraint-violation one.
    const { data: already } = await admin
      .from('promo_redemptions').select('id').eq('promo_code_id', promo.id).eq('customer_id', user.id).maybeSingle();
    if (already) return json({ error: "You've already used this promo code." }, 400);

    const discount = promo.discount_type === 'percent'
      ? Math.round(fare * (Number(promo.discount_value) / 100) * 100) / 100
      : Math.min(fare, Number(promo.discount_value));
    const newFare = Math.max(0, Math.round((fare - discount) * 100) / 100);

    const { error: redeemErr } = await admin.from('promo_redemptions').insert({
      promo_code_id: promo.id, customer_id: user.id,
      booking_type, booking_id, discount_amount: discount,
    });
    if (redeemErr) {
      // Most likely the unique-constraint race (two requests at once) —
      // report it the same way as the "already used" check above.
      return json({ error: "You've already used this promo code." }, 400);
    }

    await admin.from('promo_codes').update({ uses_count: promo.uses_count + 1 }).eq('id', promo.id);
    await admin.from(table).update({
      estimated_fare: newFare, promo_code: normalizedCode, discount_amount: discount,
    }).eq('id', booking_id);

    return json({ ok: true, discount_amount: discount, new_fare: newFare });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
