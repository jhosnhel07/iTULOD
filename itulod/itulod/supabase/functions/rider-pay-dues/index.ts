// =============================================================================
// iTULOD Edge Function: rider-pay-dues
// -----------------------------------------------------------------------------
// "Pay with GCash" on the rider's Earnings: pays exactly what the rider owes
// iTULOD (rider_debt_status — commission on cash trips, less online fares
// iTULOD holds for them, less settlements), worked out here, never sent by the
// app. Creates a rider_payments row + a PayMongo GCash source and returns the
// checkout_url. When GCash confirms, paymongo-webhook / sync-payment-status
// call settle_rider_payment() (sql/051): the balance drops to ₱0.00.
//
//   POST {}  →  { checkout_url, amount, id }
//
// Deploy: supabase functions deploy rider-pay-dues
// =============================================================================
import { adminClient, getRequestUser, json, paymongoFetch, toCentavos, CORS_HEADERS } from '../_shared/helpers.ts';

// PayMongo's smallest GCash payment
const GCASH_MIN = 20;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const admin = adminClient();
    const { data: profile } = await admin.from('profiles').select('full_name, role').eq('id', user.id).single();
    if (profile?.role !== 'rider') return json({ error: 'Only riders can do this.' }, 403);

    const { data: debt, error: debtErr } = await admin.rpc('rider_debt_status', { p_rider: user.id });
    if (debtErr) throw debtErr;
    const owed = Math.round(Number(debt?.[0]?.owed ?? 0) * 100) / 100;
    if (owed <= 0) return json({ error: "You don't owe iTULOD anything right now." }, 400);
    if (owed < GCASH_MIN) {
      return json({ error: `GCash needs at least ₱${GCASH_MIN}. Pay the ₱${owed.toFixed(2)} to the admin instead and tap "I paid the admin".` }, 400);
    }

    const { data: row, error: insertErr } = await admin
      .from('rider_payments')
      .insert({ rider_id: user.id, amount: owed })
      .select('id')
      .single();
    if (insertErr || !row) return json({ error: 'Could not start the payment.' }, 500);

    const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY')!;
    const siteUrl = Deno.env.get('SITE_URL') || '';
    const billing = user.email ? { name: profile?.full_name || 'iTULOD rider', email: user.email } : undefined;

    const source = await paymongoFetch('/sources', secretKey, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            amount: toCentavos(owed),
            currency: 'PHP',
            type: 'gcash',
            redirect: {
              success: `${siteUrl}/payment-return.html?type=rider&id=${row.id}&result=success`,
              failed: `${siteUrl}/payment-return.html?type=rider&id=${row.id}&result=failed`,
            },
            ...(billing ? { billing } : {}),
          },
        },
      }),
    });

    await admin.from('rider_payments').update({ paymongo_reference: source.data.id }).eq('id', row.id);
    return json({ checkout_url: source.data.attributes.redirect.checkout_url, amount: owed, id: row.id });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
