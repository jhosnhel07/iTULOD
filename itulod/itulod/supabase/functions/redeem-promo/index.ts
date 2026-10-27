// =============================================================================
// iTULOD Edge Function: redeem-promo
// -----------------------------------------------------------------------------
// Applies a promo the customer picked (or typed) to a booking they just made.
// Kept server-side because "how many times has this code been used" and "has
// this customer already used it" must be checked and updated together, with
// no way for the client to skip the check.
//
// Works for every service in the promo's list (promo_codes.services, sql/053)
// now that a booking's total is fixed (sql/050). The discount never takes a
// fare below the minimum fare; iTULOD pays for it (the rider earns their
// share of the full price — booking_before_update, sql/053).
//
//   POST { code, booking_type: 'transport'|'food'|'parcel'|'hauling', booking_id }
//
// Deploy: supabase functions deploy redeem-promo
// =============================================================================
import { adminClient, getRequestUser, json, TABLE_BY_KIND, CORS_HEADERS } from '../_shared/helpers.ts';

const SERVICE_LABEL: Record<string, string> = { transport: 'rides', food: 'food delivery', parcel: 'parcels', hauling: 'hauling' };

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { code, booking_type, booking_id } = await req.json();
    const table = TABLE_BY_KIND[booking_type];
    if (!table) return json({ error: 'Unknown booking_type.' }, 400);
    const normalizedCode = String(code || '').trim().toUpperCase();
    if (!normalizedCode) return json({ error: 'Enter a promo code.' }, 400);

    const admin = adminClient();

    const { data: booking, error: bookingErr } = await admin
      .from(table).select('id, customer_id, estimated_fare, final_fare, promo_code, status, payment_status')
      .eq('id', booking_id).single();
    if (bookingErr || !booking) return json({ error: 'Booking not found.' }, 404);
    if (booking.customer_id !== user.id) return json({ error: 'This booking does not belong to you.' }, 403);
    if (booking.promo_code) return json({ error: 'A promo code has already been applied to this booking.' }, 400);
    if (!['pending', 'accepted'].includes(booking.status) || booking.payment_status === 'paid') {
      return json({ error: 'A promo can only be added before the booking is paid or under way.' }, 400);
    }

    const { data: promo, error: promoErr } = await admin
      .from('promo_codes').select('*').ilike('code', normalizedCode).maybeSingle();
    if (promoErr || !promo) return json({ error: 'That promo code was not found.' }, 404);
    if (!promo.active) return json({ error: 'That promo has ended.' }, 400);
    if (promo.expires_at && new Date(promo.expires_at) < new Date()) {
      return json({ error: 'That promo has expired.' }, 400);
    }
    if (promo.max_uses != null && promo.uses_count >= promo.max_uses) {
      return json({ error: 'That promo has been fully used.' }, 400);
    }
    const services: string[] = promo.services || ['transport', 'food', 'parcel', 'hauling'];
    if (!services.includes(booking_type)) {
      return json({ error: `That promo isn't for ${SERVICE_LABEL[booking_type]}.` }, 400);
    }
    const fare = Number(booking.estimated_fare || 0);
    if (promo.min_fare && fare < Number(promo.min_fare)) {
      return json({ error: `This promo needs a total of at least ₱${Number(promo.min_fare).toFixed(2)}.` }, 400);
    }

    // One use per customer per code — the unique constraint on
    // promo_redemptions is the real enforcement; this gives a clean message.
    const { data: already } = await admin
      .from('promo_redemptions').select('id').eq('promo_code_id', promo.id).eq('customer_id', user.id).maybeSingle();
    if (already) return json({ error: "You've already used this promo." }, 400);

    // Never below the minimum fare.
    const { data: cfg } = await admin.from('platform_config').select('fare_min').single();
    const minFare = Number(cfg?.fare_min ?? 20);
    const raw = promo.discount_type === 'percent'
      ? Math.round(fare * (Number(promo.discount_value) / 100) * 100) / 100
      : Number(promo.discount_value);
    const discount = Math.round(Math.min(raw, fare - minFare) * 100) / 100;
    if (!(discount > 0)) {
      return json({ error: `This booking is already at the ₱${minFare.toFixed(2)} minimum fare.` }, 400);
    }
    const newFare = Math.round((fare - discount) * 100) / 100;

    const { error: redeemErr } = await admin.from('promo_redemptions').insert({
      promo_code_id: promo.id, customer_id: user.id,
      booking_type, booking_id, discount_amount: discount,
    });
    if (redeemErr) {
      // Most likely the unique-constraint race (two requests at once).
      return json({ error: "You've already used this promo." }, 400);
    }
    await admin.from('promo_claims').upsert(
      { promo_code_id: promo.id, customer_id: user.id },
      { onConflict: 'promo_code_id,customer_id', ignoreDuplicates: true },
    );

    await admin.from('promo_codes').update({ uses_count: promo.uses_count + 1 }).eq('id', promo.id);
    // A rider who already accepted set final_fare to the booked total: lower it too.
    const update: Record<string, unknown> = { estimated_fare: newFare, promo_code: promo.code, discount_amount: discount };
    if (booking.final_fare != null) update.final_fare = Math.max(0, Math.round((Number(booking.final_fare) - discount) * 100) / 100);
    await admin.from(table).update(update).eq('id', booking_id);

    return json({ ok: true, code: promo.code, discount_amount: discount, new_fare: newFare });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
