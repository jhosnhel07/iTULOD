// =============================================================================
// iTULOD Edge Functions — shared payment-status helpers
// -----------------------------------------------------------------------------
// Used by both paymongo-webhook (the async, provider-pushed path) and
// sync-payment-status (the on-demand, client-pulled path) so there is exactly
// one place that decides what "marking a booking paid/failed" means.
// =============================================================================
import { adminClient, TABLE_BY_KIND } from './helpers.ts';
import { notifyUser } from './notify.ts';

// Look up which booking table + row a PayMongo reference (source id or
// payment_intent id) belongs to.
export async function findBookingByReference(admin: ReturnType<typeof adminClient>, reference: string) {
  for (const [kind, table] of Object.entries(TABLE_BY_KIND)) {
    const { data } = await admin.from(table).select('id, customer_id, payment_status').eq('paymongo_reference', reference).maybeSingle();
    if (data) return { kind, table, booking: data };
  }
  return null;
}

export async function markBookingPaid(admin: ReturnType<typeof adminClient>, reference: string) {
  const hit = await findBookingByReference(admin, reference);
  if (!hit) return null;
  if (hit.booking.payment_status === 'paid') return hit; // idempotent
  await admin.from(hit.table).update({ payment_status: 'paid' }).eq('id', hit.booking.id);
  await notifyUser(admin, hit.booking.customer_id, {
    title: 'Payment received',
    message: 'Your GCash payment went through. Thanks!',
  }).catch((e) => console.error('notifyUser failed:', e));
  return hit;
}

export async function markBookingFailed(admin: ReturnType<typeof adminClient>, reference: string) {
  const hit = await findBookingByReference(admin, reference);
  if (!hit) return null;
  if (hit.booking.payment_status === 'paid') return hit; // never downgrade an already-paid booking
  await admin.from(hit.table).update({ payment_status: 'failed' }).eq('id', hit.booking.id);
  await notifyUser(admin, hit.booking.customer_id, {
    title: 'Payment did not go through',
    message: 'Your GCash payment failed. You can retry from Booking history.',
  }).catch((e) => console.error('notifyUser failed:', e));
  return hit;
}

// ---- wallet ---------------------------------------------------------------
// A GCash source can also fund a wallet.wallet_topups row instead of a
// booking. Callers try findBookingByReference/markBookingPaid first (see
// paymongo-webhook and sync-payment-status) and fall back to these when that
// comes back empty.
export async function creditWallet(
  admin: ReturnType<typeof adminClient>,
  customerId: string,
  amount: number,
  opts: { type: string; bookingType?: string; bookingId?: string; note?: string }
) {
  const { error } = await admin.rpc('adjust_wallet_balance', { p_customer_id: customerId, p_delta: amount });
  if (error) throw error;
  await admin.from('wallet_transactions').insert({
    customer_id: customerId,
    type: opts.type,
    amount,
    booking_type: opts.bookingType ?? null,
    booking_id: opts.bookingId ?? null,
    note: opts.note ?? null,
  });
}

export async function markWalletTopupPaid(admin: ReturnType<typeof adminClient>, reference: string) {
  const { data: topup } = await admin.from('wallet_topups').select('*').eq('paymongo_reference', reference).maybeSingle();
  if (!topup) return null;
  if (topup.status === 'paid') return topup; // idempotent
  await admin.from('wallet_topups').update({ status: 'paid' }).eq('id', topup.id);
  await creditWallet(admin, topup.customer_id, Number(topup.amount), { type: 'topup', note: 'GCash top-up' });
  await notifyUser(admin, topup.customer_id, {
    title: 'Wallet topped up',
    message: `₱${Number(topup.amount).toFixed(2)} was added to your iTULOD wallet.`,
  }).catch((e) => console.error('notifyUser failed:', e));
  return topup;
}

export async function markWalletTopupFailed(admin: ReturnType<typeof adminClient>, reference: string) {
  const { data: topup } = await admin.from('wallet_topups').select('*').eq('paymongo_reference', reference).maybeSingle();
  if (!topup) return null;
  if (topup.status === 'paid') return topup; // never downgrade an already-credited topup
  await admin.from('wallet_topups').update({ status: 'failed' }).eq('id', topup.id);
  return topup;
}
