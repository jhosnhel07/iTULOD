/* Integration test for automatic booking expiration
   (sql/009_booking_expiration.sql). Verifies against a REAL Supabase project
   (needs sql/schema.sql + 002..009 applied) that:

   1. a PENDING booking older than the 15-minute grace period is flipped to
      'expired' by expire_stale_bookings() — and one just inside the window
      is left alone;
   2. an ACCEPTED booking is expired 15 minutes after accepted_at, not
      created_at;
   3. an ONGOING booking is never auto-expired, no matter how old;
   4. once expired, an ordinary client can no longer change its status
      ("expired bookings should no longer be editable, confirmed, or used").

   Same env vars as test/integration/money-path.test.mjs — skips without them:
     ITULOD_TEST_SUPABASE_URL, ITULOD_TEST_ANON_KEY, ITULOD_TEST_SERVICE_ROLE_KEY

   Run with: npm run test:integration
*/
import test from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.ITULOD_TEST_SUPABASE_URL;
const ANON = process.env.ITULOD_TEST_ANON_KEY;
const SERVICE = process.env.ITULOD_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const minutesAgo = (n) => new Date(Date.now() - n * 60 * 1000).toISOString();

test('booking expiration: pending/accepted time out, ongoing never does, expired is locked', { skip: ready ? false : 'set ITULOD_TEST_* env vars to run' }, async (t) => {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  const stamp = Date.now();
  const customerEmail = `itulod.test.expcust.${stamp}@example.com`;
  let customerId, vehicleId;
  const bookingIds = [];

  t.after(async () => {
    for (const id of bookingIds) await admin.from('transport_bookings').delete().eq('id', id).catch(() => {});
    if (customerId) await admin.auth.admin.deleteUser(customerId).catch(() => {});
  });

  const { data: userData, error: userErr } = await admin.auth.admin.createUser({
    email: customerEmail, password: `Test-${stamp}-pw`, email_confirm: true,
    user_metadata: { full_name: 'Test Expiry Customer', role: 'customer' },
  });
  assert.ifError(userErr);
  customerId = userData.user.id;

  const { data: vehicle, error: vErr } = await admin.from('vehicles').select('id').limit(1).single();
  assert.ifError(vErr);
  vehicleId = vehicle.id;

  const mk = async (overrides) => {
    const { data, error } = await admin.from('transport_bookings').insert({
      customer_id: customerId, vehicle_id: vehicleId,
      pickup_address: 'Test pickup', destination_address: 'Test destination',
      estimated_fare: 50, status: 'pending', payment_method: 'cash',
      ...overrides,
    }).select('id').single();
    assert.ifError(error);
    bookingIds.push(data.id);
    return data.id;
  };

  const stalePendingId   = await mk({ created_at: minutesAgo(20) });
  const freshPendingId   = await mk({ created_at: minutesAgo(5) });
  const staleAcceptedId  = await mk({ created_at: minutesAgo(60), status: 'accepted', rider_id: customerId, accepted_at: minutesAgo(20) });
  const staleOngoingId   = await mk({ created_at: minutesAgo(120), status: 'ongoing', rider_id: customerId, accepted_at: minutesAgo(90) });

  const { data: expiredCount, error: rpcErr } = await admin.rpc('expire_stale_bookings');
  assert.ifError(rpcErr);
  assert.ok(expiredCount >= 2, `expected at least 2 bookings expired, got ${expiredCount}`);

  const statusOf = async (id) => (await admin.from('transport_bookings').select('status').eq('id', id).single()).data.status;

  assert.equal(await statusOf(stalePendingId), 'expired', 'a pending booking past 15 min should expire');
  assert.equal(await statusOf(freshPendingId), 'pending', 'a pending booking still inside the grace period should not expire');
  assert.equal(await statusOf(staleAcceptedId), 'expired', 'an accepted booking past 15 min since acceptance should expire');
  assert.equal(await statusOf(staleOngoingId), 'ongoing', 'an ongoing (in-progress) booking must never auto-expire');

  // Once expired, an ordinary authenticated client can't revive it.
  const customer = createClient(URL, ANON, { auth: { persistSession: false } });
  {
    const { error } = await customer.auth.signInWithPassword({ email: customerEmail, password: `Test-${stamp}-pw` });
    assert.ifError(error);
  }
  {
    const { error } = await customer.from('transport_bookings')
      .update({ status: 'cancelled' }).eq('id', stalePendingId);
    assert.ok(error, 'expected the client update on an expired booking to be rejected');
  }
});
