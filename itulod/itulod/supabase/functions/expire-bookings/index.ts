// =============================================================================
// iTULOD Edge Function: expire-bookings
// -----------------------------------------------------------------------------
// Runs the server-side sweep (sql/009_booking_expiration.sql's
// expire_stale_bookings()) that flips stale bookings to 'expired':
//   - PENDING  for more than 15 minutes with no rider accepting it
//   - ACCEPTED for more than 15 minutes with the rider never starting the job
//
// This function does no work itself — it just calls the database function so
// the sweep can be triggered on a schedule without the pg_cron extension
// (some Supabase plans don't have it enabled). Point any scheduler at this:
//   - Supabase Dashboard -> Edge Functions -> expire-bookings -> Cron, every
//     1-5 minutes (the simplest option, no extra infra), OR
//   - an external pinger (cron-job.org, GitHub Actions schedule, etc.)
//
// Intentionally has NO auth check: expire_stale_bookings() is safe to call
// from anywhere (no input, no data returned beyond a count, and it can only
// ever expire bookings that are already past their own grace period) — most
// free schedulers can't attach custom headers, so requiring one here would
// just make this harder to wire up for no real security benefit.
//
// Deploy: supabase functions deploy expire-bookings --no-verify-jwt
// =============================================================================
import { adminClient, json, CORS_HEADERS } from '../_shared/helpers.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const admin = adminClient();
    const { data, error } = await admin.rpc('expire_stale_bookings');
    if (error) throw error;
    return json({ ok: true, expired: data ?? 0, at: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    return json({ error: err instanceof Error ? err.message : 'Unexpected error.' }, 500);
  }
});
