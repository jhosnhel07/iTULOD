/**
 * iTULOD — rider dashboard
 */
let CURRENT_PROFILE = null;
let RIDER_APPROVED = false;
let RIDER_HAS_ACTIVE_BOOKING = false;
let HISTORY_KIND = 'transport';
let HISTORY_PAGE = 1;
const PAGE_SIZE = 6;
// TABLE_BY_KIND / ICON_BY_KIND / COLOR_BY_KIND, initials(), setAvatarImg() and
// the Profile form are in js/dashboard-common.js (shared with the customer app).

(async function init() {
  CURRENT_PROFILE = await requireSession(['rider']);
  if (!CURRENT_PROFILE) return;

  document.getElementById('side-name').textContent = CURRENT_PROFILE.full_name;
  document.getElementById('side-avatar').textContent = initials(CURRENT_PROFILE.full_name);
  if (CURRENT_PROFILE.avatar_url) setAvatarImg(document.getElementById('side-avatar'), CURRENT_PROFILE.avatar_url);

  await checkApproval();

  wireTabNav();
  wireHistoryTabs();
  wireProfileForm();
  populateProfileForm();

  await loadAccepted(); // sets RIDER_HAS_ACTIVE_BOOKING before requests render
  await loadRequests();
  await loadEarnings();
  await loadHistory();
  await loadVehicleInfo();
  await loadRiderHome();
  subscribeRealtime();

  if (typeof enablePushNotifications === 'function') enablePushNotifications();

  // The navigation map (Mapbox GL, ~200 KB) loads the first time the Accepted
  // bookings tab is opened — see ensureNavMap() / activateTab(). A rider with a
  // job in progress usually lands there straight away.
})();

let _navMapPromise = null;
function ensureNavMap() {
  if (_navMapPromise) return _navMapPromise;
  _navMapPromise = loadMapbox()
    .then(() => {
      initNavigationMap('nav-map');
      return loadAccepted(); // redraw the route now that the map exists
    })
    .catch((err) => {
      _navMapPromise = null;
      console.error('Navigation map failed to load:', err);
    });
  return _navMapPromise;
}

async function checkApproval() {
  const { data } = await supabase.from('rider_applications').select('*').eq('rider_id', CURRENT_PROFILE.id).order('created_at', { ascending: false }).limit(1).single();
  RIDER_APPROVED = data?.status === 'approved';
  const banner = document.getElementById('approval-banner');
  if (data && data.status !== 'approved') {
    // .approval-banner, not .badge — a badge is white-space: nowrap, so this
    // sentence rendered as a 413px pill that pushed the page wider than a phone.
    const pending = data.status === 'pending';
    banner.innerHTML = `
      <div class="approval-banner approval-banner--${pending ? 'pending' : 'rejected'}">
        <i class="fa-solid ${pending ? 'fa-hourglass-half' : 'fa-circle-xmark'}"></i>
        <span>
          <strong>Application ${escapeHtml(data.status)}.</strong>
          ${pending
            ? 'You can browse requests, but you cannot accept bookings until an admin approves you.'
            : 'Contact support if you think this was a mistake.'}
        </span>
      </div>`;
  }
}

// ---- tab nav ---------------------------------------------------------
const TAB_TITLES = {
  home: ['Home', 'Your day at a glance.'],
  requests: ['Booking requests', 'New bookings waiting for a rider.'],
  accepted: ['Accepted bookings', 'Your current rides and deliveries.'],
  earnings: ['Earnings', 'Track your daily, weekly, and monthly income.'],
  history: ['History', 'Completed and cancelled bookings.'],
  vehicle: ['Vehicle info', 'Your application and vehicle details.'],
  profile: ['Profile', 'Manage your account details.'],
};

// Single source of truth for switching tabs — driven by both the sidebar and
// the mobile bottom nav (any element carrying a data-tab).
function activateTab(name) {
  if (!document.getElementById('tab-' + name)) return;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));

  // The nav map lives inside this tab — load it on first open, then fix its
  // size (it may have been created while the tab was hidden).
  if (name === 'accepted') {
    if (typeof ensureNavMap === 'function') ensureNavMap().then(() => {
      if (typeof resizeNavigationMap === 'function') resizeNavigationMap();
    });
    if (typeof resizeNavigationMap === 'function') {
      requestAnimationFrame(() => resizeNavigationMap());
    }
  }
  const titles = TAB_TITLES[name];
  if (titles) {
    document.getElementById('page-title').textContent = titles[0];
    document.getElementById('page-sub').textContent = titles[1];
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
  closeSidebar();
}

function wireTabNav() {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

// ---- home / overview -------------------------------------------------
async function loadRiderHome() {
  const [payRes, revRes, acc0, acc1, acc2] = await Promise.all([
    supabase.from('payments').select('rider_payout, created_at').eq('rider_id', CURRENT_PROFILE.id),
    supabase.from('reviews').select('rating').eq('rider_id', CURRENT_PROFILE.id),
    ...Object.keys(TABLE_BY_KIND).map(k =>
      supabase.from(TABLE_BY_KIND[k]).select('*').eq('rider_id', CURRENT_PROFILE.id)
        .in('status', ['accepted', 'ongoing']).then(r => ({ k, rows: r.data || [] }))
    ),
  ]);
  const pendCounts = await Promise.all(Object.keys(TABLE_BY_KIND).map(k =>
    supabase.from(TABLE_BY_KIND[k]).select('id', { count: 'exact', head: true }).is('rider_id', null).eq('status', 'pending')
  ));
  const openCount = pendCounts.reduce((a, r) => a + (r.count || 0), 0);

  const payments = payRes.data || [];
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const todayPays = payments.filter(p => new Date(p.created_at) >= startOfDay);
  document.getElementById('home-earn-today').textContent = peso(todayPays.reduce((a, p) => a + Number(p.rider_payout), 0));
  document.getElementById('home-trips-today').textContent = todayPays.length;

  const reviews = revRes.data || [];
  document.getElementById('home-rating').textContent = reviews.length
    ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) + ' ★'
    : '—';
  document.getElementById('home-open-requests').textContent = openCount;

  const active = [acc0, acc1, acc2].flatMap(r => r.rows.map(row => ({ ...row, _kind: r.k })));
  renderRiderHomeActive(active, openCount);
}

function renderRiderHomeActive(list, openCount) {
  const el = document.getElementById('home-active');
  if (!list.length) {
    const waiting = openCount > 0;
    el.innerHTML = `
      <div class="home-hero">
        <div>
          <h3>${waiting ? `${openCount} request${openCount > 1 ? 's' : ''} waiting` : 'No active booking'}</h3>
          <p>${waiting ? 'Grab one before another rider does.' : 'New requests will appear here as customers book.'}</p>
        </div>
        <button type="button" class="btn btn-primary" onclick="activateTab('requests')">
          <i class="fa-solid fa-inbox"></i> View requests
        </button>
      </div>`;
    return;
  }
  const b = list.find(x => x.status === 'ongoing') || list[0];
  const kind = b._kind;
  const title = kind === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
    : kind === 'food' ? `${b.restaurant_name} → ${b.delivery_address}`
    : `${b.sender_address} → ${b.receiver_address}`;
  const next = b.status === 'accepted'
    ? `<button type="button" class="btn btn-outline btn-sm" onclick="updateStatus('${kind}','${b.id}','ongoing')">Start trip</button>`
    : `<button type="button" class="btn btn-primary btn-sm" onclick="updateStatus('${kind}','${b.id}','completed')">Mark complete</button>`;
  el.innerHTML = `
    <div class="home-active card">
      <div class="home-active__head">
        <span class="home-active__tag"><i class="fa-solid ${ICON_BY_KIND[kind]}"></i> ${kind === 'transport' ? 'Ride' : kind === 'food' ? 'Food' : 'Parcel'}</span>
        ${statusBadge(b.status)}
      </div>
      <h3>${escapeHtml(title)}</h3>
      <p class="home-active__stage">${b.status === 'accepted' ? 'Navigate to the pickup point' : 'Trip in progress'}</p>
      <div class="home-active__meta">
        <span><i class="fa-solid fa-peso-sign"></i> ${peso(b.estimated_fare)}</span>
      </div>
      <div class="home-active__actions">
        <button type="button" class="btn btn-primary btn-sm" onclick="activateTab('accepted')">
          <i class="fa-solid fa-location-arrow"></i> Open navigation
        </button>
        ${next}
      </div>
    </div>`;
}

// ---- booking requests (unassigned, pending) ---------------------------
async function loadRequests() {
  const list = document.getElementById('requests-list');
  showSkeleton(list, skeletonList(3));
  const results = await Promise.all(Object.keys(TABLE_BY_KIND).map(kind =>
    supabase.from(TABLE_BY_KIND[kind]).select('*').is('rider_id', null).eq('status', 'pending').order('created_at', { ascending: false }).then(r => ({ kind, rows: r.data || [] }))
  ));
  const merged = results.flatMap(r => r.rows.map(row => ({ ...row, _kind: r.kind }))).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (merged.length === 0) {
    list.innerHTML = emptyState({
      icon: 'fa-inbox',
      title: 'No requests right now',
      body: 'New booking requests appear here the moment a customer books.'
    });
    return;
  }
  list.innerHTML = merged.map(b => renderRequestCard(b, b._kind)).join('');
}

function renderRequestCard(b, kind) {
  const title = kind === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
    : kind === 'food' ? `${b.restaurant_name} → ${b.delivery_address}`
    : `${b.sender_address} → ${b.receiver_address}`;
  const disabledReason = !RIDER_APPROVED
    ? 'disabled title="Wait for admin approval"'
    : RIDER_HAS_ACTIVE_BOOKING
      ? 'disabled title="Finish your current booking before accepting another"'
      : '';
  return bookingCardHTML({
    kind, id: b.id, iconBg: COLOR_BY_KIND[kind], icon: ICON_BY_KIND[kind],
    title, sub: `${kind[0].toUpperCase() + kind.slice(1)} · ${formatDate(b.created_at)}`,
    fare: b.estimated_fare,
    actions: `<button class="btn btn-primary btn-sm" ${disabledReason} onclick="event.stopPropagation(); acceptBooking('${kind}','${b.id}')"><i class="fa-solid fa-check"></i> Accept</button>`,
  });
}

async function acceptBooking(kind, id) {
  if (RIDER_HAS_ACTIVE_BOOKING) {
    toast('Finish your current booking before accepting another.', 'error');
    return;
  }

  // Re-check against the database right before accepting to close the race
  // window (e.g. two tabs open, or a second click before the UI re-renders).
  const stillActive = await Promise.all(Object.keys(TABLE_BY_KIND).map(k =>
    supabase.from(TABLE_BY_KIND[k]).select('id', { count: 'exact', head: true }).eq('rider_id', CURRENT_PROFILE.id).in('status', ['accepted', 'ongoing'])
  ));
  if (stillActive.some(r => (r.count || 0) > 0)) {
    toast('Finish your current booking before accepting another.', 'error');
    await loadAccepted();
    await loadRequests();
    return;
  }

  const table = TABLE_BY_KIND[kind];
  const { error } = await supabase.from(table).update({ rider_id: CURRENT_PROFILE.id, status: 'accepted' }).eq('id', id).is('rider_id', null);
  if (error) { toast(error.message, 'error'); return; }
  toast('Booking accepted!', 'success');
  await loadAccepted(); // sets RIDER_HAS_ACTIVE_BOOKING + (re)draws the route on the nav map
  await loadRequests();
  await loadRiderHome();
}

// ---- accepted bookings (mine, accepted/ongoing) ------------------------
async function loadAccepted() {
  const list = document.getElementById('accepted-list');
  showSkeleton(list, skeletonList(1));
  const results = await Promise.all(Object.keys(TABLE_BY_KIND).map(kind =>
    supabase.from(TABLE_BY_KIND[kind]).select('*').eq('rider_id', CURRENT_PROFILE.id).in('status', ['accepted', 'ongoing']).order('created_at', { ascending: false }).then(r => ({ kind, rows: r.data || [] }))
  ));
  const merged = results.flatMap(r => r.rows.map(row => ({ ...row, _kind: r.kind })));
  RIDER_HAS_ACTIVE_BOOKING = merged.length > 0;

  updateNavMapForAccepted(merged);

  // Broadcast live GPS to the customer while there's a job in progress.
  const active = merged.find(b => b.status === 'ongoing') || merged[0];
  if (active && typeof startLocationBroadcast === 'function') {
    startLocationBroadcast(active._kind === 'transport' ? 'transport' : active._kind, active.id);
  } else if (typeof stopLocationBroadcast === 'function') {
    stopLocationBroadcast();
  }

  if (merged.length === 0) {
    list.innerHTML = emptyState({
      icon: 'fa-route',
      title: 'No active booking',
      body: 'Accept a request from Booking requests to start navigating.'
    });
    return;
  }
  list.innerHTML = merged.map(b => renderAcceptedCard(b, b._kind)).join('');
}

// Keep the nav map's route in sync with whatever booking the rider is
// currently working — always visible, whether landing on the tab fresh,
// after accepting a request, after a status change, or on a realtime update.
function updateNavMapForAccepted(merged) {
  if (!merged || merged.length === 0) {
    if (typeof clearRiderRoute === 'function') clearRiderRoute();
    return;
  }
  // An ongoing trip takes priority over a merely-accepted one so the map
  // always reflects the booking actively in progress right now.
  const active = merged.find(b => b.status === 'ongoing') || merged[0];
  const kind = active._kind;
  const pickup = kind === 'transport' ? active.pickup_address : kind === 'food' ? active.pickup_address : active.sender_address;
  const dropoff = kind === 'transport' ? active.destination_address : kind === 'food' ? active.delivery_address : active.receiver_address;
  if (pickup && dropoff && typeof showRiderRoute === 'function') showRiderRoute(pickup, dropoff);
}

function renderAcceptedCard(b, kind) {
  const title = kind === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
    : kind === 'food' ? `${b.restaurant_name} → ${b.delivery_address}`
    : `${b.sender_address} → ${b.receiver_address}`;

  // Food / parcel: the rider confirms the real fare at pickup before completing.
  const needsFinalFare = kind !== 'transport' && b.final_fare == null;
  const setFareAction = needsFinalFare
    ? `<span class="fare-set">
         <input type="number" inputmode="decimal" min="1" step="0.5" id="ff-${b.id}"
                placeholder="₱ final fare" value="${b.estimated_fare || ''}"
                onclick="event.stopPropagation()" class="fare-set__input">
         <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); setFinalFare('${kind}','${b.id}')">Set fare</button>
       </span>`
    : '';

  const canComplete = b.status === 'ongoing' && !needsFinalFare;
  const nextAction = b.status === 'accepted'
    ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); updateStatus('${kind}','${b.id}','ongoing')"><i class="fa-solid fa-play"></i> Start trip</button>`
    : canComplete
      ? `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); updateStatus('${kind}','${b.id}','completed')"><i class="fa-solid fa-flag-checkered"></i> Mark complete</button>`
      : '';

  const paidBadge = b.payment_method === 'gcash'
    ? `<span class="badge ${b.payment_status === 'paid' ? 'badge--completed' : 'badge--pending'}">GCash · ${b.payment_status}</span>`
    : '';

  return bookingCardHTML({
    kind, id: b.id, iconBg: COLOR_BY_KIND[kind], icon: ICON_BY_KIND[kind],
    title, sub: `${kind[0].toUpperCase() + kind.slice(1)} · ${formatDate(b.created_at)}`,
    fare: b.final_fare ?? b.estimated_fare, status: b.status,
    footLeft: paidBadge,
    actions: setFareAction + nextAction,
  });
}

async function setFinalFare(kind, id) {
  const input = document.getElementById('ff-' + id);
  const amount = parseFloat(input?.value);
  if (!amount || amount <= 0) { toast('Enter the final fare.', 'error'); return; }
  const { data, error } = await supabase.functions.invoke('finalize-fare', {
    body: { booking_type: kind, booking_id: id, amount },
  });
  if (error || data?.error) { toast(data?.error || error.message, 'error'); return; }
  toast('Fare confirmed. The customer has been notified.', 'success');
  await loadAccepted();
}

async function updateStatus(kind, id, status) {
  const table = TABLE_BY_KIND[kind];

  // Transport bookings paid by GCash/Card are charged up front — don't let
  // the trip start (or complete) until PayMongo has actually confirmed it,
  // otherwise a rider could give a free ride on a payment that never went through.
  if (kind === 'transport' && (status === 'ongoing' || status === 'completed')) {
    const { data: current } = await supabase.from(table).select('payment_method, payment_status').eq('id', id).single();
    if (current && current.payment_method !== 'cash' && current.payment_status !== 'paid') {
      toast(`Customer's ${current.payment_method === 'gcash' ? 'GCash' : 'card'} payment hasn't gone through yet.`, 'error');
      return;
    }
  }

  // The booking_before_update() DB trigger owns everything that happens on
  // completion: it validates + locks final_fare, marks cash bookings paid, and
  // creates the payout row in `payments`. The client only changes the status.
  const { error } = await supabase.from(table).update({ status }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Status updated!', 'success');
  await loadAccepted(); // clears RIDER_HAS_ACTIVE_BOOKING once nothing's left in progress
  await loadRequests(); // re-enable Accept buttons now that the rider is free again
  await loadEarnings();
  await loadHistory();
  await loadRiderHome();
}

// ---- earnings ----------------------------------------------------------
async function loadEarnings() {
  const { data: payments } = await supabase.from('payments').select('*').eq('rider_id', CURRENT_PROFILE.id);
  const rows = payments || [];
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfWeek = new Date(startOfDay); startOfWeek.setDate(startOfDay.getDate() - startOfDay.getDay());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const sum = (filterFn) => rows.filter(filterFn).reduce((a, r) => a + Number(r.rider_payout), 0);
  document.getElementById('earn-daily').textContent = peso(sum(r => new Date(r.created_at) >= startOfDay));
  document.getElementById('earn-weekly').textContent = peso(sum(r => new Date(r.created_at) >= startOfWeek));
  document.getElementById('earn-monthly').textContent = peso(sum(r => new Date(r.created_at) >= startOfMonth));

  const { data: reviews } = await supabase.from('reviews').select('rating').eq('rider_id', CURRENT_PROFILE.id);
  if (reviews && reviews.length > 0) {
    const avg = reviews.reduce((a, r) => a + r.rating, 0) / reviews.length;
    document.getElementById('earn-rating').textContent = avg.toFixed(1) + ' ★';
  }

  // last 7 days bar chart
  const days = [...Array(7)].map((_, i) => { const d = new Date(startOfDay); d.setDate(d.getDate() - (6 - i)); return d; });
  const totals = days.map(d => sum(r => { const rd = new Date(r.created_at); return rd.toDateString() === d.toDateString(); }));
  const max = Math.max(1, ...totals);
  document.getElementById('earnings-chart').innerHTML = totals.map(t => `<div class="bar" style="height:${Math.max(4, (t / max) * 100)}%"><span>${t > 0 ? peso(t) : ''}</span></div>`).join('');
  document.getElementById('earnings-labels').innerHTML = days.map(d => `<span>${d.toLocaleDateString('en-PH', { weekday: 'short' })}</span>`).join('');
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

async function loadHistory() {
  const table = TABLE_BY_KIND[HISTORY_KIND];
  const list = document.getElementById('history-list');
  showSkeleton(list, skeletonList(3), HISTORY_KIND);
  const { data, error } = await supabase.from(table).select('*').eq('rider_id', CURRENT_PROFILE.id).in('status', ['completed', 'cancelled']).order('created_at', { ascending: false });
  if (error || !data || data.length === 0) {
    list.innerHTML = error
      ? emptyState({
          icon: 'fa-triangle-exclamation',
          title: 'Could not load your history',
          body: error.message,
          tone: 'error'
        })
      : emptyState({
          icon: 'fa-inbox',
          title: 'Nothing completed yet',
          body: 'Finished and cancelled bookings in this category will be listed here.'
        });
    document.getElementById('history-pagination').innerHTML = '';
    return;
  }
  const { slice, totalPages } = paginate(data, HISTORY_PAGE, PAGE_SIZE);
  list.innerHTML = slice.map(b => {
    const title = HISTORY_KIND === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
      : HISTORY_KIND === 'food' ? b.restaurant_name : `${b.sender_name} → ${b.receiver_name}`;
    return `
      <div class="booking-card" role="button" tabindex="0" onclick="openBookingDetails({ kind: '${HISTORY_KIND}', id: '${b.id}' })" onkeydown="if(event.key==='Enter'||event.key===' '){ openBookingDetails({ kind: '${HISTORY_KIND}', id: '${b.id}' }); }">
        <div class="kind-icon" style="background:${COLOR_BY_KIND[HISTORY_KIND]}"><i class="fa-solid ${ICON_BY_KIND[HISTORY_KIND]}"></i></div>
        <div class="info"><div><h4>${escapeHtml(title)}</h4><p>${formatDate(b.created_at)}${b.rating ? ' · ' + '★'.repeat(b.rating) : ''}</p></div></div>
        <div class="meta"><span class="fare">${peso(b.final_fare ?? b.estimated_fare)}</span>${statusBadge(b.status)}</div>
      </div>`;
  }).join('');
  renderPagination(totalPages);
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

// ---- vehicle info --------------------------------------------------------
async function loadVehicleInfo() {
  const el = document.getElementById('vehicle-info');
  showSkeleton(el, skeletonList(1));
  const { data } = await supabase.from('rider_applications').select('*').eq('rider_id', CURRENT_PROFILE.id).order('created_at', { ascending: false }).limit(1).single();
  if (!data) {
    el.innerHTML = emptyState({
      icon: 'fa-file-circle-question',
      title: 'No application on file',
      body: 'Contact support if you believe your rider application is missing.'
    });
    return;
  }
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;justify-content:space-between"><span>Status</span>${statusBadge(data.status)}</div>
      <div style="display:flex;justify-content:space-between"><span>Vehicle type</span><strong>${escapeHtml(data.vehicle_type)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Plate number</span><strong>${escapeHtml(data.vehicle_plate || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>License number</span><strong>${escapeHtml(data.license_number || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Submitted</span><strong>${formatDate(data.created_at)}</strong></div>
      ${data.notes ? `<div style="background:var(--slate-50);padding:12px;border-radius:8px;font-size:0.85rem">Admin note: ${escapeHtml(data.notes)}</div>` : ''}
    </div>`;
}

// ---- profile ----
// populateProfileForm() and wireProfileForm() are in js/dashboard-common.js.

// ---- realtime ------------------------------------------------------------
function subscribeRealtime() {
  const refresh = () => loadAccepted().then(loadRequests).then(loadRiderHome);
  supabase.channel('rider-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_bookings' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'food_deliveries' }, refresh)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parcel_deliveries' }, refresh)
    .subscribe();
}
