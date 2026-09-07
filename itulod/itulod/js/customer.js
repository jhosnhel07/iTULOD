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

  // Wire every control up front, so a later failure (a map, a slow query)
  // can't leave buttons dead.
  wireTabNav();
  wireBookingSwitch();
  wireRideForm();
  wireFoodForm();
  wireParcelForm();
  wireHistoryTabs();
  wireProfileForm();
  wireStarInput();

  await loadHome();
  await loadHistory();
  await loadNotifications();
  populateProfileForm();
  subscribeRealtime();

  // Maps last and isolated — if Mapbox fails to load (CDN blocked, offline)
  // the rest of the dashboard must still work.
  if (typeof mapboxgl !== 'undefined') {
    try {
      initTrackingMap('tracking-map');
      initFoodMap('food-map');
      initParcelMap('parcel-map');
    } catch (err) {
      console.error('Map init failed:', err);
    }
  }
})();

function initials(name) { return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }

// Unread badge — mirrored on the sidebar link and the mobile top-bar bell.
function setNotifCount(unread) {
  document.querySelectorAll('.js-notif-count').forEach(el => {
    el.textContent = unread;
    el.style.display = unread > 0 ? 'inline-block' : 'none';
  });
}
function setAvatarImg(el, url) { el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }

// ---- sidebar tab switching ---------------------------------------------
const TAB_TITLES = {
  'home': ['Home', 'Your bookings at a glance.'],
  'book': ['New booking', 'Choose your pickup, destination, and vehicle.'],
  'history': ['Booking history', 'All your rides, food, and parcel deliveries.'],
  'notifications': ['Notifications', 'Updates about your bookings.'],
  'profile': ['Profile', 'Manage your account details.'],
};

// Ride / Food / Parcel are one screen now — this switches between them and
// keeps the page subtitle + that service's map in sync.
const BOOKING_SUBTITLES = {
  ride: 'Choose your pickup, destination, and vehicle.',
  food: 'Order from any restaurant or store.',
  parcel: 'Send a parcel across Ilocos Norte.',
};
function currentBookingService() {
  return document.querySelector('#booking-switch .seg-btn.active')?.dataset.service || 'ride';
}
function setBookingService(svc) {
  document.querySelectorAll('#booking-switch .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.service === svc));
  document.querySelectorAll('.booking-view').forEach(v => v.classList.toggle('active', v.id === 'view-' + svc));
  const sub = document.getElementById('page-sub');
  if (sub && document.getElementById('tab-book').classList.contains('active')) sub.textContent = BOOKING_SUBTITLES[svc];
  if (typeof resizeBookingMap === 'function') requestAnimationFrame(() => resizeBookingMap(svc));
}
function wireBookingSwitch() {
  document.querySelectorAll('#booking-switch .seg-btn').forEach(btn => {
    btn.addEventListener('click', () => setBookingService(btn.dataset.service));
  });
}

// Single source of truth for switching tabs — driven by both the sidebar and
// the mobile bottom nav (any element carrying a data-tab).
function activateTab(name) {
  if (!document.getElementById('tab-' + name)) return;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));

  const titles = TAB_TITLES[name];
  if (titles) {
    document.getElementById('page-title').textContent = titles[0];
    document.getElementById('page-sub').textContent = titles[1];
  }
  // Re-fit the visible booking map (it was sized while hidden).
  if (name === 'book') setBookingService(currentBookingService());
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebar();
}

function wireTabNav() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
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

    const paymentMethod = document.getElementById('ride-payment').value; // cash | gcash
    const km = simulateDistanceKm(pickup.value.toLowerCase(), dest.value.toLowerCase());
    // One fare value for both the inserted row and the confirmation modal, so
    // the amount shown can never drift from the amount charged.
    const fare = estimateFare(vehicle, km);
    setLoading(btn, true);
    const { data: booking, error } = await supabase.from('transport_bookings').insert({
      customer_id: CURRENT_PROFILE.id,
      vehicle_id: vehicle.id,
      pickup_address: pickup.value.trim(),
      destination_address: dest.value.trim(),
      distance_km: km,
      estimated_fare: fare,
      status: 'pending',
      payment_method: paymentMethod
    }).select('id').single();
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }

    if (paymentMethod === 'cash') {
      toast('Ride booked! Waiting for a rider to accept.', 'success');
      // Show route on map (shared geocoder — OpenStreetMap first, Mapbox backup)
      const [pLngLat, dLngLat] = await Promise.all([
        _geocodeAddress(pickup.value),
        _geocodeAddress(dest.value),
      ]);
      if (pLngLat) setTrackingMarker('pickup', pLngLat, '#22c55e', 'Pickup');
      if (dLngLat) setTrackingMarker('dropoff', dLngLat, '#ef4444', 'Drop-off');
      if (pLngLat && dLngLat) drawRoute(pLngLat, dLngLat);
    } else if (paymentMethod === 'gcash') {
      // Confirm the amount first. Don't reset the form or reload history yet:
      // the customer can still cancel out of the modal, and confirming
      // navigates away to GCash anyway.
      openGcashConfirm({
        bookingType: 'transport',
        bookingId: booking.id,
        amount: fare,
        rows: [
          ['Payment method', 'GCash'],
          ['Pickup', pickup.value.trim()],
          ['Destination', dest.value.trim()],
          ['Distance', km.toFixed(1) + ' km']
        ]
      });
      return;
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

// ---- home / overview ---------------------------------------------------
const HOME_KIND_LABEL = { transport: 'Ride', food: 'Food delivery', parcel: 'Parcel delivery' };

async function loadHome() {
  const kinds = Object.keys(TABLE_BY_KIND);
  const perKind = await Promise.all(kinds.map(k =>
    supabase.from(TABLE_BY_KIND[k]).select('*').eq('customer_id', CURRENT_PROFILE.id)
      .order('created_at', { ascending: false })
      .then(r => (r.data || []).map(row => ({ ...row, _kind: k })))
  ));
  const rows = perKind.flat().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  // Lifetime stats
  const completed = rows.filter(r => r.status === 'completed');
  const spent = completed.reduce((a, r) => a + Number(r.final_fare ?? r.estimated_fare ?? 0), 0);
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
  document.getElementById('home-stat-trips').textContent = completed.length;
  document.getElementById('home-stat-spent').textContent = peso(spent);
  document.getElementById('home-stat-month').textContent =
    completed.filter(r => new Date(r.created_at) >= monthStart).length;

  // Active booking (pending / accepted / ongoing)
  const active = rows.find(r => ['pending', 'accepted', 'ongoing'].includes(r.status));
  let rider = null;
  if (active && active.rider_id) {
    const { data } = await supabase.from('profiles').select('full_name, phone').eq('id', active.rider_id).single();
    rider = data || null;
  }
  renderHomeActive(active, rider);

  // Recent activity
  const recent = document.getElementById('home-recent');
  recent.innerHTML = rows.length
    ? rows.slice(0, 4).map(r => renderHistoryCard(r, r._kind)).join('')
    : emptyState({ icon: 'fa-inbox', title: 'No bookings yet', body: 'Your rides and deliveries will show up here.' });
}

function renderHomeActive(b, rider) {
  const el = document.getElementById('home-active');
  if (!b) {
    el.innerHTML = `
      <div class="home-hero">
        <div>
          <h3>Ready when you are</h3>
          <p>Book a ride, order food, or send a parcel across Ilocos Norte.</p>
        </div>
        <button type="button" class="btn btn-primary" onclick="activateTab('book')">
          <i class="fa-solid fa-plus"></i> New booking
        </button>
      </div>`;
    return;
  }
  const kind = b._kind;
  const title = kind === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
    : kind === 'food' ? `${b.restaurant_name} → ${b.delivery_address}`
    : `${b.sender_address} → ${b.receiver_address}`;
  const stage = b.status === 'pending' ? 'Finding you a rider…'
    : b.status === 'accepted' ? 'Rider is on the way to pickup'
    : 'Trip in progress';
  const riderLine = b.rider_id
    ? `<span><i class="fa-solid fa-motorcycle"></i> ${escapeHtml(rider?.full_name || 'Rider assigned')}${rider?.phone ? ' · ' + escapeHtml(rider.phone) : ''}</span>`
    : `<span><i class="fa-solid fa-user-clock"></i> No rider yet</span>`;
  el.innerHTML = `
    <div class="home-active card">
      <div class="home-active__head">
        <span class="home-active__tag"><i class="fa-solid ${ICON_BY_KIND[kind]}"></i> ${HOME_KIND_LABEL[kind]}</span>
        ${statusBadge(b.status)}
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p class="home-active__stage">${stage}</p>
      <div class="home-active__meta">
        ${riderLine}
        <span><i class="fa-solid fa-peso-sign"></i> ${peso(b.final_fare ?? b.estimated_fare)}</span>
      </div>
      <div class="home-active__actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="openBookingDetails({ kind: '${kind}', id: '${b.id}' })">
          <i class="fa-solid fa-eye"></i> View details
        </button>
        ${['pending', 'accepted'].includes(b.status)
          ? `<button type="button" class="btn btn-outline btn-sm btn-danger-ghost" onclick="cancelBooking('${kind}','${b.id}')"><i class="fa-solid fa-xmark"></i> Cancel</button>`
          : ''}
      </div>
    </div>`;
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
  const list = document.getElementById('history-list');
  showSkeleton(list, skeletonList(3), HISTORY_KIND);
  const { data, error } = await supabase.from(table).select('*').eq('customer_id', CURRENT_PROFILE.id).order('created_at', { ascending: false });
  if (error) {
    list.innerHTML = emptyState({
      icon: 'fa-triangle-exclamation',
      title: 'Could not load your bookings',
      body: error.message,
      tone: 'error'
    });
    // Otherwise the previous page's pagination bar sits under the error.
    document.getElementById('history-pagination').innerHTML = '';
    return;
  }
  if (!data || data.length === 0) {
    list.innerHTML = emptyState({
      icon: 'fa-inbox',
      title: 'No bookings yet',
      body: 'Bookings in this category will show up here once you make one.'
    });
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
  // GCash is the only online method offered, so it's the only one we can retry.
  const needsPaymentRetry = kind === 'transport' && b.payment_method === 'gcash'
    && ['pending', 'failed'].includes(b.payment_status) && b.status !== 'cancelled';

  const actions = [
    needsPaymentRetry && `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); retryPayment('${b.id}')"><i class="fa-solid fa-mobile-screen-button"></i> Pay with GCash</button>`,
    canCancel && `<button class="btn btn-outline btn-sm btn-danger-ghost" onclick="event.stopPropagation(); cancelBooking('${kind}','${b.id}')"><i class="fa-solid fa-xmark"></i> Cancel</button>`,
    canRate && `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); openRateModal('${kind}','${b.id}')"><i class="fa-solid fa-star"></i> Rate rider</button>`,
  ].filter(Boolean).join('');

  return bookingCardHTML({
    kind, id: b.id, iconBg: COLOR_BY_KIND[kind], icon: ICON_BY_KIND[kind],
    title, sub, fare, status: b.status,
    footLeft: kind === 'transport' ? paymentBadge(b) : '',
    actions,
  });
}

function paymentBadge(b) {
  if (b.payment_method === 'cash') return '';
  // 'card' can still appear on bookings made before card checkout was removed.
  const label = b.payment_method === 'gcash' ? 'GCash' : 'Card';
  const cls = { paid: 'badge--completed', failed: 'badge--cancelled', pending: 'badge--pending' }[b.payment_status] || 'badge--pending';
  return `<span class="badge ${cls}">${label} · ${b.payment_status}</span>`;
}

async function retryPayment(bookingId) {
  // Re-read the row instead of trusting the rendered card: the fare may have
  // changed since the list was drawn, and create-payment charges whatever
  // estimated_fare currently says.
  const { data: b, error } = await supabase
    .from('transport_bookings')
    .select('estimated_fare, pickup_address, destination_address, distance_km')
    .eq('id', bookingId)
    .single();

  if (error || !b) { toast('Could not load that booking.', 'error'); return; }

  openGcashConfirm({
    bookingType: 'transport',
    bookingId,
    amount: b.estimated_fare,
    rows: [
      ['Payment method', 'GCash'],
      ['Pickup', b.pickup_address],
      ['Destination', b.destination_address],
      ['Distance', b.distance_km ? Number(b.distance_km).toFixed(1) + ' km' : '—']
    ]
  });
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
  loadHome();
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
  const list = document.getElementById('notif-list');
  showSkeleton(list, skeletonList(3));
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', CURRENT_PROFILE.id).order('created_at', { ascending: false }).limit(30);
  if (error || !data || data.length === 0) {
    list.innerHTML = error
      ? emptyState({
          icon: 'fa-triangle-exclamation',
          title: 'Could not load notifications',
          body: error.message,
          tone: 'error'
        })
      : emptyState({
          icon: 'fa-bell-slash',
          title: 'No notifications yet',
          body: "We'll let you know here when there's an update on a booking."
        });
    setNotifCount(0);
    return;
  }
  const unread = data.filter(n => !n.is_read).length;
  setNotifCount(unread);

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
  document.getElementById('profile-phone').value = formatPhoneMobile(CURRENT_PROFILE.phone || '');
  document.getElementById('profile-email').value = CURRENT_PROFILE.email || '';
  const preview = document.getElementById('profile-avatar-preview');
  if (CURRENT_PROFILE.avatar_url) setAvatarImg(preview, CURRENT_PROFILE.avatar_url);
  else preview.textContent = initials(CURRENT_PROFILE.full_name);
}

function wireProfileForm() {
  attachInputMask(document.getElementById('profile-phone'), formatPhoneMobile);
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profile-submit');
    const full_name = document.getElementById('profile-name').value.trim();
    const phone = normalizePhoneMobile(document.getElementById('profile-phone').value);
    if (!requireFields({ 'Full name': full_name })) return;
    if (phone && !isValidPhoneMobile(phone)) {
      toast('Please enter a valid mobile number (09XX XXX XXXX).', 'error');
      return;
    }

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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_bookings', filter: `customer_id=eq.${CURRENT_PROFILE.id}` }, () => { loadHome(); if (HISTORY_KIND === 'transport') loadHistory(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'food_deliveries', filter: `customer_id=eq.${CURRENT_PROFILE.id}` }, () => { loadHome(); if (HISTORY_KIND === 'food') loadHistory(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parcel_deliveries', filter: `customer_id=eq.${CURRENT_PROFILE.id}` }, () => { loadHome(); if (HISTORY_KIND === 'parcel') loadHistory(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${CURRENT_PROFILE.id}` }, () => loadNotifications())
    .subscribe();
}
