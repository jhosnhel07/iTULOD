/* End-to-end money-path test: signup -> book -> accept -> complete, plus the
   two guarantees sql/005_server_side_money_and_hardening.sql adds:

     1. the customer cannot edit estimated_fare once the row exists
     2. on completion the DB (not the client) writes the payments row with a
        15% platform commission and the rest as rider payout

   Runs against a REAL Supabase project that already has schema.sql + 002..007
   applied. Provide credentials via env vars (all three required, or the test
   skips):

     ITULOD_TEST_SUPABASE_URL          https://<ref>.supabase.co
     ITULOD_TEST_ANON_KEY              the anon / publishable key
     ITULOD_TEST_SERVICE_ROLE_KEY      the service_role key (bypasses RLS)

   It creates two throwaway auth users and deletes them (with their bookings)
   at the end.

   Needs `npm install` first (for @supabase/supabase-js). Run with:
     npm run test:integration
*/
import test from 'node:test';
import assert from 'node:assert/strict';

const URL = process.env.ITULOD_TEST_SUPABASE_URL;
const ANON = process.env.ITULOD_TEST_ANON_KEY;
const SERVICE = process.env.ITULOD_TEST_SERVICE_ROLE_KEY;
const ready = Boolean(URL && ANON && SERVICE);

const round2 = (n) => Math.round(n * 100) / 100;

test('money path: book -> accept -> complete writes a correct payout', { skip: ready ? false : 'set ITULOD_TEST_* env vars to run' }, async (t) => {
  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

  const stamp = Date.now();
  const customerEmail = `itulod.test.customer.${stamp}@example.com`;
  const riderEmail = `itulod.test.rider.${stamp}@example.com`;
  const password = `Test-${stamp}-pw`;
  let customerId, riderId, bookingId;

  t.after(async () => {
    if (customerId) await admin.auth.admin.deleteUser(customerId).catch(() => {});
    if (riderId) await admin.auth.admin.deleteUser(riderId).catch(() => {});
  });

  // --- signup (the on_auth_user_created trigger makes the profile rows) ---
  const mk = async (email, role, full_name) => {
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { full_name, role },
    });
    assert.ifError(error);
    return data.user.id;
  };
  customerId = await mk(customerEmail, 'customer', 'Test Customer');
  riderId = await mk(riderEmail, 'rider', 'Test Rider');

  // approve the rider so is_approved_rider() passes
  await admin.from('profiles').update({ is_active: true }).eq('id', riderId);
  {
    const { error } = await admin.from('rider_applications').insert({
      rider_id: riderId, status: 'approved',
      vehicle_type: 'Motorcycle', license_number: 'N01-23-456789', vehicle_plate: 'ABC 1234',
    });
    assert.ifError(error);
  }

  const { data: vehicle, error: vErr } = await admin
    .from('vehicles').select('id, base_fare, per_km_rate').limit(1).single();
  assert.ifError(vErr);
  const fare = round2(Number(vehicle.base_fare) + Number(vehicle.per_km_rate) * 5);

  // --- customer books ---
  const customer = createClient(URL, ANON, { auth: { persistSession: false } });
  {
    const { error } = await customer.auth.signInWithPassword({ email: customerEmail, password });
    assert.ifError(error);
  }
  {
    const { data, error } = await customer.from('transport_bookings').insert({
      customer_id: customerId, vehicle_id: vehicle.id,
      pickup_address: 'Laoag City Hall', destination_address: 'Batac Public Market',
      distance_km: 5, estimated_fare: fare, status: 'pending', payment_method: 'cash',
    }).select('id').single();
    assert.ifError(error);
    bookingId = data.id;
  }

  // --- guarantee 1: customer cannot rewrite the fare ---
  {
    const { error } = await customer.from('transport_bookings')
      .update({ estimated_fare: 1 }).eq('id', bookingId);
    assert.ok(error, 'expected the fare-tamper update to be rejected by the trigger');
  }

  // --- rider accepts and runs the trip ---
  const rider = createClient(URL, ANON, { auth: { persistSession: false } });
  {
    const { error } = await rider.auth.signInWithPassword({ email: riderEmail, password });
    assert.ifError(error);
  }
  {
    const { error } = await rider.from('transport_bookings')
      .update({ rider_id: riderId, status: 'accepted' })
      .eq('id', bookingId).is('rider_id', null);
    assert.ifError(error);
  }
  for (const status of ['ongoing', 'completed']) {
    const { error } = await rider.from('transport_bookings').update({ status }).eq('id', bookingId);
    assert.ifError(error);
  }

  // --- guarantee 2: the DB wrote the payout ---
  const { data: pay, error: pErr } = await admin.from('payments')
    .select('amount, platform_commission, rider_payout, method, status')
    .eq('booking_type', 'transport').eq('booking_id', bookingId).single();
  assert.ifError(pErr);

  const commission = round2(fare * 0.15);
  assert.equal(Number(pay.amount), fare);
  assert.equal(Number(pay.platform_commission), commission);
  assert.equal(Number(pay.rider_payout), round2(fare - commission));

  const { data: booking } = await admin.from('transport_bookings')
    .select('final_fare, payment_status').eq('id', bookingId).single();
  assert.equal(Number(booking.final_fare), fare);
  assert.equal(booking.payment_status, 'paid'); // cash is settled on completion
});
