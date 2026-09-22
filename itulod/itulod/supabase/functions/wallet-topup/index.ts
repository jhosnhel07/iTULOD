// =============================================================================
// iTULOD Edge Function: wallet-topup
// -----------------------------------------------------------------------------
// Starts a GCash top-up of the customer's in-app wallet. Creates a
// wallet_topups row (status pending) plus a PayMongo Source, and returns a
// checkout_url to redirect to — the same pattern as create-payment, except
// the money isn't tied to any booking. Confirmation arrives the same way a
// booking payment does: paymongo-webhook (real source of truth) with
// sync-payment-status as the on-demand fallback, both falling back to a
// wallet_topups lookup when no booking matches the PayMongo reference.
//
// Deploy:  supabase functions deploy wallet-topup
// =============================================================================
import { adminClient, getRequestUser, json, paymongoFetch, toCentavos, CORS_HEADERS } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { amount } = await req.json();
    const amt = Number(amount);
    if (!(amt > 0)) return json({ error: 'Enter an amount greater than zero.' }, 400);
    if (amt > 50000) return json({ error: 'Top-ups are capped at ₱50,000 at a time.' }, 400);

    const admin = adminClient();

    const { data: topup, error: insertErr } = await admin
      .from('wallet_topups')
      .insert({ customer_id: user.id, amount: amt })
      .select('id')
      .single();
    if (insertErr || !topup) return json({ error: 'Could not start top-up.' }, 500);

    const secretKey = Deno.env.get('PAYMONGO_SECRET_KEY')!;
    const siteUrl = Deno.env.get('SITE_URL') || '';
    const { data: profile } = await admin.from('profiles').select('full_name').eq('id', user.id).single();
    const billing = user.email
      ? { name: profile?.full_name || 'iTULOD customer', email: user.email }
      : undefined;

    const source = await paymongoFetch('/sources', secretKey, {
      method: 'POST',
      body: JSON.stringify({
        data: {
          attributes: {
            amount: toCentavos(amt),
            currency: 'PHP',
            type: 'gcash',
            redirect: {
              success: `${siteUrl}/payment-return.html?type=wallet&id=${topup.id}&result=success`,
              failed: `${siteUrl}/payment-return.html?type=wallet&id=${topup.id}&result=failed`
            },
            ...(billing ? { billing } : {})
          }
        }
      })
    });

    await admin.from('wallet_topups').update({ paymongo_reference: source.data.id }).eq('id', topup.id);

    return json({ checkout_url: source.data.attributes.redirect.checkout_url });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
