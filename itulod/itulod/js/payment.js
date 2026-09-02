/**
 * iTULOD — payment module (PayMongo: GCash)
 * -----------------------------------------------------------------------
 * Cash needs nothing here — it's collected by the rider on completion,
 * same as before. GCash goes through the `create-payment` Supabase Edge
 * Function so the PayMongo *secret* key never reaches the browser.
 *
 * Card payments are intentionally not offered: GCash is the only online
 * method in the payment-method dropdown.
 *
 * The flow is: confirm the amount here -> GCash authorization page ->
 * payment-return.html shows the receipt.
 */

// ---- Step 1: confirm the amount ------------------------------------------
// Shows what PayMongo is about to charge before handing the customer off, so
// they never land on the GCash page wondering where the number came from.
//
// `amount` must be the booking's estimated_fare — that is the column
// create-payment reads and converts to centavos. Passing final_fare here would
// display one number and charge another.
let PENDING_PAYMENT = null;

function openGcashConfirm({ bookingType, bookingId, amount, rows = [] }) {
  const overlay = document.getElementById('pay-modal');
  // Pages that include payment.js without the modal markup still work — they
  // just skip straight to checkout rather than silently doing nothing.
  if (!overlay) return payWithGcash(bookingType, bookingId);

  PENDING_PAYMENT = { bookingType, bookingId };

  document.getElementById('pay-amount').textContent = peso(amount);

  const summary = document.getElementById('pay-summary');
  summary.innerHTML = rows
    .map(([label, value]) => `
      <div class="receipt-row">
        <dt>${escapeHtml(label)}</dt>
        <dd>${escapeHtml(value)}</dd>
      </div>`)
    .join('');
  // An empty <dl> would still paint its border as a thin empty box.
  summary.style.display = rows.length ? '' : 'none';

  const btn = document.getElementById('pay-confirm');
  btn.innerHTML = `<i class="fa-solid fa-mobile-screen-button"></i> Pay ${peso(amount)}`;
  // Assigned, not addEventListener — reopening the modal must not stack up
  // handlers and open several PayMongo sources per click.
  btn.onclick = submitGcashPayment;

  overlay.classList.add('open');
}

function closePayModal() {
  PENDING_PAYMENT = null;
  const overlay = document.getElementById('pay-modal');
  if (overlay) overlay.classList.remove('open');
}

async function submitGcashPayment() {
  if (!PENDING_PAYMENT) return;
  const { bookingType, bookingId } = PENDING_PAYMENT;
  const btn = document.getElementById('pay-confirm');

  setLoading(btn, true);
  const ok = await payWithGcash(bookingType, bookingId);

  // On success the browser is already navigating to GCash — leave the button
  // disabled so a second click can't create a duplicate source on the way out.
  if (!ok) {
    setLoading(btn, false);
    closePayModal();
  }
}

// ---- Step 2: GCash redirect flow -----------------------------------------
// Creates a PayMongo Source and sends the shopper to GCash to authorize the
// payment. They land back on payment-return.html afterwards.
async function payWithGcash(bookingType, bookingId) {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { booking_type: bookingType, booking_id: bookingId, method: 'gcash' }
  });

  if (error || data?.error) {
    toast(await gcashErrorMessage(error, data), 'error');
    return false;
  }
  toast('Redirecting to GCash…', 'info');
  window.location.href = data.checkout_url;
  return true;
}

// functions.invoke() reports failures three different ways, and only one of
// them puts anything useful in `data` — so unpack all three or we end up
// showing "something went wrong" for every distinct cause.
async function gcashErrorMessage(error, data) {
  if (data?.error) return data.error;

  // FunctionsHttpError: the function ran and returned non-2xx. The real
  // message is in the Response body hanging off error.context, not in `data`.
  if (error?.name === 'FunctionsHttpError' && error.context) {
    const body = await error.context.json().catch(() => null);
    if (body?.error) return body.error;
    return `Payment service returned ${error.context.status}.`;
  }

  // FunctionsFetchError: no response reached the browser at all — either the
  // network is down, or create-payment isn't deployed (the gateway's 404 lacks
  // the CORS headers the preflight needs, so the browser blocks it and fetch
  // throws before any status is readable).
  if (error?.name === 'FunctionsFetchError') {
    return 'Could not reach the payment service. Check your connection, and that the create-payment Edge Function is deployed (README §5).';
  }

  return error?.message || 'Could not start GCash checkout.';
}
