/**
 * iTULOD — customer dashboard
 */
let CURRENT_PROFILE = null;
let VEHICLES = [];
let HISTORY_KIND = 'transport';
let HISTORY_PAGE = 1;
const PAGE_SIZE = 6;
let RATING_TARGET = null; // { kind, id }

(async function init() {
  CURRENT_PROFILE = await requireSession(['customer']);
  if (!CURRENT_PROFILE) return;

  document.getElementById('side-name').textContent = CURRENT_PROFILE.full_name;
  document.getElementById('side-avatar').textContent = initials(CURRENT_PROFILE.full_name);
  if (CURRENT_PROFILE.avatar_url) setAvatarImg(document.getElementById('side-avatar'), CURRENT_PROFILE.avatar_url);

  await loadVehicleOptions();
  wireTabNav();
  initTrackingMap('tracking-map');
  initFoodMap('food-map');
  initParcelMap('parcel-map');
  wireRideForm();
  wireFoodForm();
  wireParcelForm();
  wireHistoryTabs();
  wireProfileForm();
  wireStarInput();
  await loadHistory();
  await loadNotifications();
  populateProfileForm();
  subscribeRealtime();
})();

function initials(name) { return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }
function setAvatarImg(el, url) { el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }

// ---- sidebar tab switching ---------------------------------------------
function wireTabNav() {
  document.querySelectorAll('.side-link[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-link[data-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      const titles = {
        'book-ride': ['Book a ride', 'Choose your pickup, destination, and vehicle.'],
        'book-food': ['Food delivery', 'Order from any restaurant or store.'],
        'book-parcel': ['Parcel delivery', 'Send a parcel across Ilocos Norte.'],
        'history': ['Booking history', 'All your rides, food, and parcel deliveries.'],
        'notifications': ['Notifications', 'Updates about your bookings.'],
        'profile': ['Profile', 'Manage your account details.']
      }[btn.dataset.tab];
      document.getElementById('page-title').textContent = titles[0];
      document.getElementById('page-sub').textContent = titles[1];
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

// ---- vehicle select + fare estimate -------------------------------------
async function loadVehicleOptions() {
  const { data, error } = await supabase.from('vehicles').select('*').eq('is_available', true).order('base_fare');
  VEHICLES = data || [];
  const opts = error || VEHICLES.length === 0
    ? `<option value="">No vehicles configured yet</option>`
    : VEHICLES.map(v => `<option value="${v.id}">${v.name} — from ${peso(v.base_fare)}</option>`).join('');
  ['ride-vehicle', 'food-vehicle', 'parcel-vehicle'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel) sel.innerHTML = opts;
  });
}

function wireRideForm() {
  const form = document.getElementById('ride-form');
  const pickup = document.getElementById('ride-pickup');
  const dest = document.getElementById('ride-destination');
  const vehicleSel = document.getElementById('ride-vehicle');
  const distanceEl = document.getElementById('ride-distance');
  const fareEl = document.getElementById('ride-fare');

  function recalc() {
    if (!pickup.value || !dest.value) { distanceEl.textContent = '—'; fareEl.textContent = '₱0.00'; return; }
    const vehicle = VEHICLES.find(v => v.id === vehicleSel.value);
    const km = simulateDistanceKm(pickup.value.toLowerCase(), dest.value.toLowerCase());
    distanceEl.textContent = km.toFixed(1) + ' km';
    fareEl.textContent = peso(estimateFare(vehicle, km));
  }
  [pickup, dest, vehicleSel].forEach(el => el.addEventListener('input', recalc));
  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => saveFormDraft('itulod-customer-ride', form));
    el.addEventListener('change', () => saveFormDraft('itulod-customer-ride', form));
  });
  restoreFormDraft('itulod-customer-ride', form);
  recalc();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('ride-submit');
    const vehicle = VEHICLES.find(v => v.id === vehicleSel.value);
    if (!requireFields({ 'Pickup location': pickup.value, 'Destination': dest.value, 'Vehicle': vehicle })) return;

    const paymentMethod = document.getElementById('ride-payment').value; // cash | gcash | card
    const km = simulateDistanceKm(pickup.value.toLowerCase(), dest.value.toLowerCase());
    setLoading(btn, true);
    const { data: booking, error } = await supabase.from('transport_bookings').insert({
      customer_id: CURRENT_PROFILE.id,
      vehicle_id: vehicle.id,
      pickup_address: pickup.value.trim(),
      destination_address: dest.value.trim(),
      distance_km: km,
      estimated_fare: estimateFare(vehicle, km),
      status: 'pending',
      payment_method: paymentMethod
    }).select('id').single();
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }

    if (paymentMethod === 'cash') {
      toast('Ride booked! Waiting for a rider to accept.', 'success');
      // Show route on map
      const geocode = async (addr) => {
        const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(addr)}.json?key=${MAPTILER_KEY}&limit=1`);
        const d = await r.json();
        return d.features?.[0]?.center || null;
      };
      const [pLngLat, dLngLat] = await Promise.all([geocode(pickup.value), geocode(dest.value)]);
      if (pLngLat) setTrackingMarker('pickup', pLngLat, '#22c55e', 'Pickup');
      if (dLngLat) setTrackingMarker('dropoff', dLngLat, '#ef4444', 'Drop-off');
      if (pLngLat && dLngLat) drawRoute(pLngLat, dLngLat);
    } else if (paymentMethod === 'gcash') {
      // Browser is about to navigate away to GCash — no need to reset the form.
      await payWithGcash('transport', booking.id);
      return;
    } else if (paymentMethod === 'card') {
      const result = await openCardModal('transport', booking.id);
      if (result.status === 'succeeded') {
        toast('Ride booked and paid!', 'success');
      } else if (result.status === 'cancelled') {
        toast('Ride booked — complete payment from Booking history when ready.', 'info');
      } else if (result.status === 'requires_action') {
        return; // already redirecting for 3-D Secure
      }
    }

    clearFormDraft('itulod-customer-ride');
    e.target.reset(); distanceEl.textContent = '—'; fareEl.textContent = '₱0.00';
    HISTORY_KIND = 'transport'; await loadHistory();
  });
}

function wireFoodForm() {
  const form = document.getElementById('food-form');
  const pickup = document.getElementById('food-pickup');
  const address = document.getElementById('food-address');
  const vehicleSel = document.getElementById('food-vehicle');
  const distanceEl = document.getElementById('food-distance');
  const fareEl = document.getElementById('food-fare');

  function recalc() {
    if (!pickup.value || !address.value) { distanceEl.textContent = '—'; fareEl.textContent = '₱0.00'; return; }
    const vehicle = VEHICLES.find(v => v.id === vehicleSel.value);
    const km = simulateDistanceKm(pickup.value.toLowerCase(), address.value.toLowerCase());
    distanceEl.textContent = km.toFixed(1) + ' km';
    fareEl.textContent = peso(estimateFare(vehicle, km));
  }
  [pickup, address, vehicleSel].forEach(el => el && el.addEventListener('input', recalc));
  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => saveFormDraft('itulod-customer-food', form));
    el.addEventListener('change', () => saveFormDraft('itulod-customer-food', form));
  });
  restoreFormDraft('itulod-customer-food', form);
  recalc();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('food-submit');
    const restaurant = document.getElementById('food-restaurant').value.trim();
    const vehicle = VEHICLES.find(v => v.id === vehicleSel.value);
    const instructions = document.getElementById('food-instructions').value.trim();
    if (!requireFields({ 'Restaurant/store name': restaurant, 'Pickup location': pickup.value, 'Delivery address': address.value, 'Vehicle': vehicle })) return;
    const km = simulateDistanceKm(pickup.value.toLowerCase(), address.value.toLowerCase());
    setLoading(btn, true);
    const { error } = await supabase.from('food_deliveries').insert({
      customer_id: CURRENT_PROFILE.id, restaurant_name: restaurant,
      pickup_address: pickup.value.trim(), delivery_address: address.value.trim(),
      instructions, vehicle_id: vehicle.id, estimated_fare: estimateFare(vehicle, km),
      distance_km: km, status: 'pending'
    });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Food delivery requested!', 'success');
    clearFormDraft('itulod-customer-food');
    e.target.reset(); distanceEl.textContent = '—'; fareEl.textContent = '₱0.00';
    HISTORY_KIND = 'food'; await loadHistory();
  });
}

function wireParcelForm() {
  const form = document.getElementById('parcel-form');
  const senderAddr = document.getElementById('parcel-sender-address');
  const receiverAddr = document.getElementById('parcel-receiver-address');
  const vehicleSel = document.getElementById('parcel-vehicle');
  const distanceEl = document.getElementById('parcel-distance');
  const fareEl = document.getElementById('parcel-fare');

  function recalc() {
    if (!senderAddr.value || !receiverAddr.value) { distanceEl.textContent = '—'; fareEl.textContent = '₱0.00'; return; }
    const vehicle = VEHICLES.find(v => v.id === vehicleSel.value);
    const km = simulateDistanceKm(senderAddr.value.toLowerCase(), receiverAddr.value.toLowerCase());
    distanceEl.textContent = km.toFixed(1) + ' km';
    fareEl.textContent = peso(estimateFare(vehicle, km));
  }
  [senderAddr, receiverAddr, vehicleSel].forEach(el => el && el.addEventListener('input', recalc));
  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => saveFormDraft('itulod-customer-parcel', form));
    el.addEventListener('change', () => saveFormDraft('itulod-customer-parcel', form));
  });
  restoreFormDraft('itulod-customer-parcel', form);
  recalc();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('parcel-submit');
    const vehicle = VEHICLES.find(v => v.id === vehicleSel.value);
    const payload = {
      customer_id: CURRENT_PROFILE.id,
      sender_name: document.getElementById('parcel-sender-name').value.trim(),
      sender_phone: document.getElementById('parcel-sender-phone').value.trim(),
      sender_address: senderAddr.value.trim(),
      receiver_name: document.getElementById('parcel-receiver-name').value.trim(),
      receiver_phone: document.getElementById('parcel-receiver-phone').value.trim(),
      receiver_address: receiverAddr.value.trim(),
      parcel_size: (document.querySelector('input[name="parcel-size"]:checked')?.value) || 'Small (fits a shoebox)',
      parcel_weight: parseFloat(document.getElementById('parcel-weight').value) || null,
      parcel_description: document.getElementById('parcel-description').value.trim(),
      instructions: document.getElementById('parcel-instructions').value.trim(),
      vehicle_id: vehicle?.id || null,
      estimated_fare: vehicle ? estimateFare(vehicle, simulateDistanceKm(senderAddr.value.toLowerCase(), receiverAddr.value.toLowerCase())) : null,
      status: 'pending'
    };
    if (!requireFields({
      'Sender name': payload.sender_name, 'Sender address': payload.sender_address,
      'Receiver name': payload.receiver_name, 'Receiver address': payload.receiver_address,
      'Vehicle': vehicle
    })) return;
    setLoading(btn, true);
    const { error } = await supabase.from('parcel_deliveries').insert(payload);
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Parcel delivery requested!', 'success');
    clearFormDraft('itulod-customer-parcel');
    e.target.reset(); distanceEl.textContent = '—'; fareEl.textContent = '₱0.00';
    HISTORY_KIND = 'parcel'; await loadHistory();
  });
}

// ---- history -------------------------------------------------------------
function wireHistoryTabs() {
  document.querySelectorAll('.tab-btn[data-history]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-history]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      HISTORY_KIND = btn.dataset.history;
      HISTORY_PAGE = 1;
      loadHistory();
    });
  });
}

const TABLE_BY_KIND = { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries' };
const ICON_BY_KIND = { transport: 'fa-car', food: 'fa-utensils', parcel: 'fa-box' };
const COLOR_BY_KIND = { transport: 'var(--blue)', food: 'var(--orange)', parcel: 'var(--green)' };

async function loadHistory() {
  const table = TABLE_BY_KIND[HISTORY_KIND];
  const { data, error } = await supabase.from(table).select('*').eq('customer_id', CURRENT_PROFILE.id).order('created_at', { ascending: false });
  const list = document.getElementById('history-list');
  if (error) { list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><p>${escapeHtml(error.message)}</p></div>`; return; }
  if (!data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No bookings yet in this category.</p></div>`;
    document.getElementById('history-pagination').innerHTML = '';
    return;
  }
  const { slice, totalPages } = paginate(data, HISTORY_PAGE, PAGE_SIZE);
  list.innerHTML = slice.map(b => renderHistoryCard(b, HISTORY_KIND)).join('');
  renderPagination(totalPages);
}

function renderHistoryCard(b, kind) {
  const title = kind === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
    : kind === 'food' ? b.restaurant_name
    : `${b.sender_name} → ${b.receiver_name}`;
  const sub = kind === 'transport' ? formatDate(b.created_at)
    : kind === 'food' ? `${b.pickup_address} → ${b.delivery_address}`
    : `${b.parcel_size || ''} · ${formatDate(b.created_at)}`;
  const fare = b.final_fare ?? b.estimated_fare;
  const canCancel = ['pending', 'accepted'].includes(b.status);
  const canRate = b.status === 'completed' && !b.rating;
  // Only transport bookings collect payment up front (food/parcel fares are
  // set by the rider at pickup, so they stay cash-on-completion for now).
  const needsPaymentRetry = kind === 'transport' && ['gcash', 'card'].includes(b.payment_method)
    && ['pending', 'failed'].includes(b.payment_status) && b.status !== 'cancelled';

  return `
    <div class="booking-card" role="button" tabindex="0" onclick="openBookingDetails({ kind: '${kind}', id: '${b.id}' })" onkeydown="if(event.key==='Enter'||event.key===' '){ openBookingDetails({ kind: '${kind}', id: '${b.id}' }); }">
      <div class="kind-icon" style="background:${COLOR_BY_KIND[kind]}"><i class="fa-solid ${ICON_BY_KIND[kind]}"></i></div>
      <div class="info"><div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(sub)}</p></div></div>
      <div class="meta">
        <span class="fare">${peso(fare)}</span>
        ${statusBadge(b.status)}
        ${kind === 'transport' ? paymentBadge(b) : ''}
        <div class="row-actions" style="margin-top:8px;justify-content:flex-end">
          ${needsPaymentRetry ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); retryPayment('${b.id}','${b.payment_method}')"><i class="fa-solid fa-credit-card"></i> Pay ${b.payment_method === 'gcash' ? 'with GCash' : 'by card'}</button>` : ''}
          ${canCancel ? `<button class="icon-btn danger" title="Cancel" onclick="event.stopPropagation(); cancelBooking('${kind}','${b.id}')"><i class="fa-solid fa-xmark"></i></button>` : ''}
          ${canRate ? `<button class="icon-btn" title="Rate" onclick="event.stopPropagation(); openRateModal('${kind}','${b.id}')"><i class="fa-solid fa-star"></i></button>` : ''}
        </div>
      </div>
    </div>`;
}

function paymentBadge(b) {
  if (b.payment_method === 'cash') return '';
  const label = b.payment_method === 'gcash' ? 'GCash' : 'Card';
  const cls = { paid: 'badge--completed', failed: 'badge--cancelled', pending: 'badge--pending' }[b.payment_status] || 'badge--pending';
  return `<span class="badge ${cls}">${label} · ${b.payment_status}</span>`;
}

async function retryPayment(bookingId, method) {
  if (method === 'gcash') {
    await payWithGcash('transport', bookingId);
  } else {
    const result = await openCardModal('transport', bookingId);
    if (result.status === 'succeeded') { toast('Payment successful!', 'success'); await loadHistory(); }
  }
}

function renderPagination(totalPages) {
  const el = document.getElementById('history-pagination');
  if (totalPages <= 1) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <button ${HISTORY_PAGE === 1 ? 'disabled' : ''} onclick="changeHistoryPage(-1)"><i class="fa-solid fa-chevron-left"></i></button>
    <span>Page ${HISTORY_PAGE} of ${totalPages}</span>
    <button ${HISTORY_PAGE === totalPages ? 'disabled' : ''} onclick="changeHistoryPage(1)"><i class="fa-solid fa-chevron-right"></i></button>`;
}
function changeHistoryPage(delta) { HISTORY_PAGE += delta; loadHistory(); }

async function cancelBooking(kind, id) {
  if (!confirm('Cancel this booking?')) return;
  const table = TABLE_BY_KIND[kind];
  const { error } = await supabase.from(table).update({ status: 'cancelled', cancelled_reason: 'Cancelled by customer' }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Booking cancelled.', 'success');
  loadHistory();
}

// ---- rating modal ----------------------------------------------------------
let selectedStars = 0;
function openRateModal(kind, id) {
  RATING_TARGET = { kind, id };
  selectedStars = 0;
  document.querySelectorAll('#star-input i').forEach(i => i.classList.remove('active'));
  document.getElementById('rate-comment').value = '';
  document.getElementById('rate-modal').classList.add('open');
}
function closeRateModal() { document.getElementById('rate-modal').classList.remove('open'); }
function wireStarInput() {
  document.querySelectorAll('#star-input i').forEach(star => {
    star.addEventListener('click', () => {
      selectedStars = Number(star.dataset.val);
      document.querySelectorAll('#star-input i').forEach(i => i.classList.toggle('active', Number(i.dataset.val) <= selectedStars));
    });
  });
  document.getElementById('submit-rating').addEventListener('click', async () => {
    if (!selectedStars) { toast('Please select a star rating.', 'error'); return; }
    const table = TABLE_BY_KIND[RATING_TARGET.kind];
    const comment = document.getElementById('rate-comment').value.trim();
    const { data: booking } = await supabase.from(table).select('rider_id').eq('id', RATING_TARGET.id).single();
    const { error } = await supabase.from(table).update({ rating: selectedStars, review: comment }).eq('id', RATING_TARGET.id);
    if (error) { toast(error.message, 'error'); return; }
    if (booking?.rider_id) {
      await supabase.from('reviews').insert({
        customer_id: CURRENT_PROFILE.id, rider_id: booking.rider_id,
        booking_type: RATING_TARGET.kind, booking_id: RATING_TARGET.id,
        rating: selectedStars, comment
      });
    }
    toast('Thanks for rating your rider!', 'success');
    closeRateModal();
    loadHistory();
  });
}

// ---- notifications ----------------------------------------------------------
async function loadNotifications() {
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', CURRENT_PROFILE.id).order('created_at', { ascending: false }).limit(30);
  const list = document.getElementById('notif-list');
  if (error || !data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bell-slash"></i><p>No notifications yet.</p></div>`;
    document.getElementById('notif-count').style.display = 'none';
    return;
  }
  const unread = data.filter(n => !n.is_read).length;
  const countEl = document.getElementById('notif-count');
  if (unread > 0) { countEl.style.display = 'inline-block'; countEl.textContent = unread; } else { countEl.style.display = 'none'; }

  list.innerHTML = data.map(n => `
    <div class="notif-item ${n.is_read ? 'read' : ''}">
      <span class="dot"></span>
      <div style="flex:1">
        <h4>${escapeHtml(n.title)}</h4>
        <p>${escapeHtml(n.message)}</p>
        <time>${formatDate(n.created_at)}</time>
      </div>
    </div>`).join('');

  supabase.from('notifications').update({ is_read: true }).eq('user_id', CURRENT_PROFILE.id).eq('is_read', false).then(() => {});
}

// ---- profile ---------------------------------------------------------------
function populateProfileForm() {
  document.getElementById('profile-name').value = CURRENT_PROFILE.full_name || '';
  document.getElementById('profile-phone').value = CURRENT_PROFILE.phone || '';
  document.getElementById('profile-email').value = CURRENT_PROFILE.email || '';
  const preview = document.getElementById('profile-avatar-preview');
  if (CURRENT_PROFILE.avatar_url) setAvatarImg(preview, CURRENT_PROFILE.avatar_url);
  else preview.textContent = initials(CURRENT_PROFILE.full_name);
}

function wireProfileForm() {
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profile-submit');
    const full_name = document.getElementById('profile-name').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    if (!requireFields({ 'Full name': full_name })) return;

    setLoading(btn, true);
    let avatar_url = CURRENT_PROFILE.avatar_url;
    const file = document.getElementById('profile-avatar-file').files[0];
    if (file) {
      const path = `${CURRENT_PROFILE.id}/avatar-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (!upErr) avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }

    const { error } = await supabase.from('profiles').update({ full_name, phone, avatar_url }).eq('id', CURRENT_PROFILE.id);
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    CURRENT_PROFILE.full_name = full_name; CURRENT_PROFILE.phone = phone; CURRENT_PROFILE.avatar_url = avatar_url;
    document.getElementById('side-name').textContent = full_name;
    toast('Profile updated!', 'success');
  });
}

// ---- realtime: refresh history/notifications when rows change --------------
function subscribeRealtime() {
  supabase.channel('customer-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_bookings', filter: `customer_id=eq.${CURRENT_PROFILE.id}` }, () => { if (HISTORY_KIND === 'transport') loadHistory(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'food_deliveries', filter: `customer_id=eq.${CURRENT_PROFILE.id}` }, () => { if (HISTORY_KIND === 'food') loadHistory(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parcel_deliveries', filter: `customer_id=eq.${CURRENT_PROFILE.id}` }, () => { if (HISTORY_KIND === 'parcel') loadHistory(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${CURRENT_PROFILE.id}` }, () => loadNotifications())
    .subscribe();
}
