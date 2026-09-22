// =============================================================================
// iTULOD Edge Function: apply-referral-code
// -----------------------------------------------------------------------------
// A signed-in customer redeems someone else's referral code, once. They get
// an instant ₱50 wallet credit; the referrer gets ₱50 back once this
// customer's first booking (any kind) completes — see
// pay_referral_bonus_on_first_completion() in sql/013_referrals.sql.
//
// Deploy: supabase functions deploy apply-referral-code
// =============================================================================
import { adminClient, getRequestUser, json, CORS_HEADERS } from '../_shared/helpers.ts';
import { creditWallet } from '../_shared/payments.ts';

const WELCOME_BONUS = 50;
const REFERRER_BONUS = 50;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const user = await getRequestUser(req);
    if (!user) return json({ error: 'Not authenticated.' }, 401);

    const { code } = await req.json();
    const normalized = String(code || '').trim().toUpperCase();
    if (!normalized) return json({ error: 'Enter a referral code.' }, 400);

    const admin = adminClient();

    const { data: me } = await admin.from('profiles').select('id, referred_by, referral_code').eq('id', user.id).single();
    if (!me) return json({ error: 'Profile not found.' }, 404);
    if (me.referred_by) return json({ error: "You've already used a referral code." }, 400);
    if (me.referral_code === normalized) return json({ error: "You can't redeem your own code." }, 400);

    const { data: referrer } = await admin.from('profiles').select('id').eq('referral_code', normalized).maybeSingle();
    if (!referrer) return json({ error: 'That referral code was not found.' }, 404);

    // The unique constraint on referral_events.referred_id is the real guard
    // against redeeming twice (e.g. two concurrent requests) — the earlier
    // referred_by check above is just the friendly, fast-path version of it.
    const { error: eventErr } = await admin.from('referral_events').insert({
      referrer_id: referrer.id,
      referred_id: user.id,
      referrer_bonus: REFERRER_BONUS,
      referred_bonus: WELCOME_BONUS,
    });
    if (eventErr) return json({ error: "You've already used a referral code." }, 400);

    await admin.from('profiles').update({ referred_by: referrer.id }).eq('id', user.id);
    await creditWallet(admin, user.id, WELCOME_BONUS, { type: 'referral_bonus', note: 'Welcome bonus for using a referral code' });

    return json({ ok: true, bonus: WELCOME_BONUS });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
