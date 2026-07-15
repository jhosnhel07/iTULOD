/**
 * iTULOD — payment module (PayMongo: GCash + Card)
 * -----------------------------------------------------------------------
 * Cash needs nothing here — it's collected by the rider on completion,
 * same as before. GCash and Card both go through Supabase Edge Functions
 * so the PayMongo *secret* key never reaches the browser. The browser only
 * ever sees the PayMongo *public* key (CONFIG.PAYMONGO_PUBLIC_KEY), which
 * is safe to expose — it can only tokenize card details, never charge them.
 */

// ---- GCash: redirect flow -------------------------------------------------
// Creates a PayMongo Source and sends the shopper to GCash to authorize the
// payment. They land back on payment-return.html afterwards.
async function payWithGcash(bookingType, bookingId) {
  const { data, error } = await supabase.functions.invoke('create-payment', {
    body: { booking_type: bookingType, booking_id: bookingId, method: 'gcash' }
  });
  if (error || data?.error) {
    toast(data?.error || error.message || 'Could not start GCash checkout.', 'error');
    return false;
  }
  toast('Redirecting to GCash…', 'info');
  window.location.href = data.checkout_url;
  return true;
}

// ---- Card: tokenize in-browser, attach server-side ------------------------
// `card` = { number, expMonth, expYear, cvc, name }
async function payWithCard(bookingType, bookingId, card) {
  // 1. Ask our Edge Function to open a Payment Intent for this booking.
  const { data: intentData, error: intentErr } = await supabase.functions.invoke('create-payment', {
    body: { booking_type: bookingType, booking_id: bookingId, method: 'card' }
  });
  if (intentErr || intentData?.error) {
    toast(intentData?.error || intentErr.message || 'Could not start card checkout.', 'error');
    return { status: 'error' };
  }

  // 2. Tokenize the card directly with PayMongo using the *public* key.
  //    Raw card details go straight to PayMongo — they never touch our server.
  let paymentMethod;
  try {
    const pmRes = await fetch('https://api.paymongo.com/v1/payment_methods', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Basic ' + btoa(`${CONFIG.PAYMONGO_PUBLIC_KEY}:`)
      },
      body: JSON.stringify({
        data: {
          attributes: {
            type: 'card',
            details: {
              card_number: card.number.replace(/\s+/g, ''),
              exp_month: Number(card.expMonth),
              exp_year: Number(card.expYear),
              cvc: card.cvc
            },
            billing: { name: card.name }
          }
        }
      })
    });
    const pmBody = await pmRes.json();
    if (!pmRes.ok) throw new Error(pmBody?.errors?.[0]?.detail || 'Card details were rejected.');
    paymentMethod = pmBody.data;
  } catch (err) {
    toast(err.message, 'error');
    return { status: 'error' };
  }

  // 3. Have the Edge Function attach the tokenized card to the intent and confirm.
  const { data: attachData, error: attachErr } = await supabase.functions.invoke('attach-card-payment', {
    body: {
      booking_type: bookingType,
      booking_id: bookingId,
      payment_intent_id: intentData.payment_intent_id,
      payment_method_id: paymentMethod.id
    }
  });
  if (attachErr || attachData?.error) {
    toast(attachData?.error || attachErr.message || 'Card payment failed.', 'error');
    return { status: 'error' };
  }

  if (attachData.status === 'requires_action' && attachData.redirect_url) {
    toast('Redirecting for your bank\u2019s verification…', 'info');
    window.location.href = attachData.redirect_url;
    return { status: 'requires_action' };
  }
  if (attachData.status === 'succeeded') {
    toast('Card payment successful!', 'success');
    return { status: 'succeeded' };
  }
  toast('Payment is still processing — check booking history shortly.', 'info');
  return { status: attachData.status };
}

// ---- small card-entry modal used by the customer dashboard ---------------
// Resolves with the same shape as payWithCard(), or { status: 'cancelled' }.
function openCardModal(bookingType, bookingId) {
  return new Promise((resolve) => {
    const modal = document.getElementById('card-modal');
    const form = document.getElementById('card-form');
    const submitBtn = document.getElementById('card-submit');

    function close(result) {
      modal.classList.remove('open');
      form.reset();
      form.removeEventListener('submit', onSubmit);
      resolve(result);
    }

    async function onSubmit(e) {
      e.preventDefault();
      const card = {
        name: document.getElementById('card-name').value.trim(),
        number: document.getElementById('card-number').value.trim(),
        expMonth: document.getElementById('card-exp-month').value.trim(),
        expYear: document.getElementById('card-exp-year').value.trim(),
        cvc: document.getElementById('card-cvc').value.trim()
      };
      if (!requireFields({ 'Name on card': card.name, 'Card number': card.number, 'Expiry month': card.expMonth, 'Expiry year': card.expYear, 'CVC': card.cvc })) return;

      setLoading(submitBtn, true);
      const result = await payWithCard(bookingType, bookingId, card);
      setLoading(submitBtn, false);
      if (result.status === 'succeeded' || result.status === 'requires_action') close(result);
    }

    document.getElementById('card-modal-cancel').onclick = () => close({ status: 'cancelled' });
    form.addEventListener('submit', onSubmit);
    modal.classList.add('open');
  });
}
