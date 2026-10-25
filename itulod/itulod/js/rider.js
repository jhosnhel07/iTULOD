/**
 * iTULOD — rider dashboard
 */
let CURRENT_PROFILE = null;
let RIDER_APPROVED = false;
// Commission owed on cash trips vs the admin's limit (sql/043 rider_debt_status)
let RIDER_DEBT = { owed: 0, debt_limit: 0, blocked: false };
let RIDER_HAS_ACTIVE_BOOKING = false;
let RIDER_ONLINE = false;
let HISTORY_KIND = 'transport';
let HISTORY_PAGE = 1;
const PAGE_SIZE = 6;
// TABLE_BY_KIND / ICON_BY_KIND / COLOR_BY_KIND, initials(), setAvatarImg() and
// the Profile form are in js/dashboard-common.js (shared with the customer app).

(async function init() {
  CURRENT_PROFILE = await requireSession(['rider']);
  if (!CURRENT_PROFILE) return;

  refreshSideAvatar(); // the profile picture menu at the top
  if (typeof startProfileSync === 'function') startProfileSync();

  await checkApproval();

  wireTabNav();
  wireHistoryTabs();
  wireProfileForm();
  wireChangePasswordForm();
  wireProofUpload();
  wireReceiptUpload();
  wireOnlineToggle();
  populateProfileForm();

  await loadHaulingVehicleNames();
  await initOnlineStatus();
  await loadAccepted(); // sets RIDER_HAS_ACTIVE_BOOKING before requests render
  await loadRequests();
  await loadEarnings();
  await loadHistory();
  await loadVehicleInfo();
  await loadRiderHome();
  await loadNotifications();
  subscribeRealtime();
  watchNotifications();
  startBookingExpiryWatch();
  // Realtime only fires on INSERT/UPDATE, so a scheduled ride crossing into
  // its 30-minute visibility window (loadRequests()) wouldn't otherwise
  // reappear until the next manual refresh — nothing about the row changes
  // when time simply passes. Same 60s cadence as the expiry watch above.
  setInterval(() => { if (!RIDER_HAS_ACTIVE_BOOKING) loadRequests(); }, 60 * 1000);

  if (typeof enablePushNotifications === 'function') enablePushNotifications();
  if (typeof renderPushPrompt === 'function') renderPushPrompt('push-prompt');

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
  history: ['History', 'Completed, cancelled, expired and no-show bookings.'],
  notifications: ['Notifications', 'Updates about your jobs, tips and account.'],
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
  // The per-service queries go last as a rest element: their count grows
  // with TABLE_BY_KIND (Hauling made it 4), and a fixed list of names before
  // them used to shift — the float read a booking result and showed ₱0.00.
  const [payRes, revRes, profileRes, ...activeByKind] = await Promise.all([
    supabase.from('payments').select('rider_payout, created_at').eq('rider_id', CURRENT_PROFILE.id),
    supabase.from('reviews').select('rating').eq('rider_id', CURRENT_PROFILE.id),
    supabase.from('profiles').select('float_amount').eq('id', CURRENT_PROFILE.id).single(),
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
  const earnedToday = peso(todayPays.reduce((a, p) => a + Number(p.rider_payout), 0));
  const heroEarn = document.getElementById('hero-earn-today');
  if (heroEarn) heroEarn.textContent = earnedToday;
  const heroTrips = document.getElementById('hero-trips-today');
  if (heroTrips) heroTrips.textContent = todayPays.length;

  const reviews = revRes.data || [];
  document.getElementById('home-rating').textContent = reviews.length
    ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) + ' ★'
    : '—';
  document.getElementById('home-open-requests').textContent = openCount;

  // -- Float card --
  if (profileRes.error) console.warn('Could not load capital on hand:', profileRes.error.message);
  const floatAmount = profileRes.data?.float_amount ?? CURRENT_PROFILE.float_amount ?? 0;
  CURRENT_PROFILE.float_amount = floatAmount;
  const floatEl = document.getElementById('home-float-amount');
  if (floatEl) floatEl.textContent = peso(floatAmount);
  const floatInput = document.getElementById('float-input');
  if (floatInput && !floatInput.value) floatInput.value = floatAmount || '';

  const active = activeByKind.flatMap(r => r.rows.map(row => ({ ...row, _kind: r.k })));
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
  const title = bookingTitle(b, kind);
  // Food/parcel completion needs the confirmed fare and a proof-of-delivery
  // photo, both of which live on the Accepted bookings card — send the rider
  // there instead of completing straight from Home.
  const next = b.status === 'accepted'
    ? `<button type="button" class="btn btn-outline btn-sm" onclick="updateStatus('${kind}','${b.id}','ongoing')">Start trip</button>`
    : kind === 'transport'
      ? `<button type="button" class="btn btn-primary btn-sm" onclick="updateStatus('${kind}','${b.id}','completed')">Mark complete</button>`
      : `<button type="button" class="btn btn-primary btn-sm" onclick="activateTab('accepted')">Finish delivery</button>`;
  el.innerHTML = `
    <div class="home-active card">
      <div class="home-active__head">
        <span class="home-active__tag"><i class="fa-solid ${ICON_BY_KIND[kind]}"></i> ${KIND_LABEL[kind]}</span>
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
  // A ride scheduled for later stays out of sight here until its pickup time
  // is close — no point showing a rider a job they'd have to remember about
  // for hours. Rides and hauling can be scheduled; food/parcel can't. Hauling
  // requests only reach riders with a Van/Pickup/Truck (RLS: is_hauling_rider()).
  const visibleBy = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  const results = await Promise.all(Object.keys(TABLE_BY_KIND).map(kind => {
    let q = supabase.from(TABLE_BY_KIND[kind]).select('*').is('rider_id', null).eq('status', 'pending');
    if (kind === 'transport' || kind === 'hauling') q = q.or(`scheduled_for.is.null,scheduled_for.lte.${visibleBy}`);
    return q.order('created_at', { ascending: false }).then(r => ({ kind, rows: r.data || [] }));
  }));
  const merged = results.flatMap(r => r.rows.map(row => ({ ...row, _kind: r.kind }))).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const { data: debt } = await supabase.rpc('rider_debt_status');
  RIDER_DEBT = (debt && debt[0]) || { owed: 0, debt_limit: 0, blocked: false };
  const debtBanner = RIDER_DEBT.blocked
    ? `<div class="fee-alert" role="alert"><i class="fa-solid fa-circle-exclamation"></i><div>
        <strong>You owe iTULOD ${peso(RIDER_DEBT.owed)} in commission</strong>
        <span>That's more than the ${peso(RIDER_DEBT.debt_limit)} limit, so you can't accept jobs until you settle it with the admin (GCash or cash). Your balance is on the Earnings page.</span>
      </div></div>`
    : '';

  if (merged.length === 0) {
    list.innerHTML = emptyState({
      icon: 'fa-inbox',
      title: 'No requests right now',
      body: 'New booking requests appear here the moment a customer books.'
    });
    if (debtBanner) list.insertAdjacentHTML('afterbegin', debtBanner);
    return;
  }
  list.innerHTML = debtBanner + merged.map(b => renderRequestCard(b, b._kind)).join('');
}

// Hauling vehicle names by id, so cards can say which vehicle a job needs.
let HAULING_VEHICLE_NAMES = {};
async function loadHaulingVehicleNames() {
  const { data } = await supabase.from('vehicles').select('id, name').eq('service', 'hauling');
  HAULING_VEHICLE_NAMES = Object.fromEntries((data || []).map(v => [v.id, v.name]));
}

/** Hauling: what the job needs, shown on the card so the rider knows before accepting. */
function haulingNeeds(b, kind) {
  if (kind !== 'hauling') return '';
  const parts = [HAULING_CATEGORY_LABEL[b.item_category] || 'Items'];
  if (b.helpers) parts.push(`${b.helpers} helper${b.helpers === 1 ? '' : 's'}`);
  if (b.estimated_weight_kg) parts.push(`~${b.estimated_weight_kg} kg`);
  const vehicle = HAULING_VEHICLE_NAMES[b.vehicle_id] || '';
  return `<span class="hauling-needs"><i class="fa-solid fa-truck-moving"></i> ${escapeHtml((vehicle ? vehicle + ' · ' : '') + parts.join(' · '))}</span>`;
}

function renderRequestCard(b, kind) {
  const title = bookingTitle(b, kind);
  const disabledReason = !RIDER_APPROVED
    ? 'disabled title="Wait for admin approval"'
    : RIDER_HAS_ACTIVE_BOOKING
      ? 'disabled title="Finish your current booking before accepting another"'
      : RIDER_DEBT.blocked
        ? 'disabled title="Settle what you owe iTULOD to accept jobs"'
        : '';
  const acceptBlock = disabledReason || (kind === 'food' && Number(b.item_subtotal || 0) > Number(CURRENT_PROFILE.float_amount || 0)
    ? 'disabled title="Not enough cash on hand for this order"' : '');
  const sub = b.scheduled_for
    ? `Scheduled · ${formatDate(b.scheduled_for)}`
    : `${KIND_LABEL[kind]} · ${formatDate(b.created_at)}`;
  // The rider buys a food order with their own cash on hand (float), so an
  // order costing more than that can't be accepted (sql/042 enforces it too).
  // It stays listed with a note so they know to raise the amount on Home.
  const float = Number(CURRENT_PROFILE.float_amount || 0);
  const shortOfCash = kind === 'food' && Number(b.item_subtotal || 0) > float;
  const floatWarning = shortOfCash
    ? `<span class="float-warning"><i class="fa-solid fa-triangle-exclamation"></i> Order costs ${peso(b.item_subtotal)} — more than your ${peso(float)} cash on hand. Raise it on Home to accept.</span>`
    : '';
  return bookingCardHTML({
    kind, id: b.id, iconBg: COLOR_BY_KIND[kind], icon: ICON_BY_KIND[kind],
    title, sub,
    footLeft: floatWarning || haulingNeeds(b, kind) || passengersChip(b, kind),
    fare: b.estimated_fare,
    actions: `<button class="btn btn-primary btn-sm" ${acceptBlock} onclick="event.stopPropagation(); acceptBooking('${kind}','${b.id}')"><i class="fa-solid fa-check"></i> Accept</button>`,
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
  const pickup = bookingPickup(active, kind);
  const dropoff = bookingDropoff(active, kind);
  if (pickup && dropoff && typeof showRiderRoute === 'function') showRiderRoute(pickup, dropoff);
}

function renderAcceptedCard(b, kind) {
  const title = bookingTitle(b, kind);

  // Food / parcel: the rider confirms the real fare at pickup before completing.
  const needsFinalFare = kind !== 'transport' && b.final_fare == null;
  const setFareAction = needsFinalFare
    ? `<span class="fare-set">
         <input type="number" inputmode="decimal" min="1" step="0.5" id="ff-${b.id}"
                placeholder="₱ final fare" value="${b.estimated_fare || ''}"
                onclick="event.stopPropagation()" class="fare-set__input">
         <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); ${kind === 'food' ? `adjustFoodBill('${b.id}')` : `setFinalFare('${kind}','${b.id}')`}">Set fare</button>
       </span>`
    : '';

  const canComplete = b.status === 'ongoing' && !needsFinalFare;
  // Grace period reminder: an accepted job that never starts expires
  // automatically 15 minutes after it was accepted (sql/009).
  const noShowAction = b.status === 'accepted'
    ? `<button class="btn btn-outline btn-sm btn-danger-ghost" onclick="event.stopPropagation(); markNoShow('${kind}','${b.id}')"><i class="fa-solid fa-user-slash"></i> No-show</button>`
    : '';
  // Can't make it after all — release the job back to the pool instead of
  // stranding the customer with a rider who never shows up.
  const releaseAction = b.status === 'accepted'
    ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); releaseJob('${kind}','${b.id}')"><i class="fa-solid fa-arrow-rotate-left"></i> Release</button>`
    : '';
  // Food/parcel/hauling drop-off: the rider takes the proof-of-delivery
  // photo as its own step, and "Mark complete" stays locked until it's saved
  // (sql/031 enforces this too). A ride has nothing to photograph.
  const needsProof = kind !== 'transport';
  const hasProof = !!safeImageUrl(b.delivery_proof_url);
  const proofAction = canComplete && needsProof
    ? (hasProof
        ? `<a class="proof-chip" href="${escapeHtml(b.delivery_proof_url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()" title="View proof of delivery">
             <img src="${escapeHtml(b.delivery_proof_url)}" alt=""><span><i class="fa-solid fa-check"></i> Proof saved</span>
           </a>
           <button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); takeDeliveryProof('${kind}','${b.id}')"><i class="fa-solid fa-camera-rotate"></i> Retake</button>`
        : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); takeDeliveryProof('${kind}','${b.id}')"><i class="fa-solid fa-camera"></i> Take proof of delivery</button>`)
    : '';
  const nextAction = b.status === 'accepted'
    ? `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); updateStatus('${kind}','${b.id}','ongoing')"><i class="fa-solid fa-play"></i> Start trip</button>`
    : !canComplete
      ? ''
      : needsProof && !hasProof
        ? `<button class="btn btn-outline btn-sm" disabled title="Take a proof-of-delivery photo first"><i class="fa-solid fa-lock"></i> Mark complete</button>`
        : `<button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); updateStatus('${kind}','${b.id}','completed')"><i class="fa-solid fa-flag-checkered"></i> Mark complete</button>`;

  // Turn-by-turn in Google Maps: to the pickup until the trip starts, then
  // to the drop-off.
  const navTarget = b.status === 'ongoing'
    ? bookingDropoff(b, kind)
    : bookingPickup(b, kind);
  const navigateAction = navTarget
    ? `<a class="btn btn-outline btn-sm" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"
          href="https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(navTarget)}">
         <i class="fa-solid fa-diamond-turn-right"></i> Navigate
       </a>`
    : '';

  const paidBadge = b.payment_method === 'gcash'
    ? `<span class="badge ${b.payment_status === 'paid' ? 'badge--completed' : 'badge--pending'}">GCash · ${b.payment_status}</span>`
    : '';

  return bookingCardHTML({
    kind, id: b.id, iconBg: COLOR_BY_KIND[kind], icon: ICON_BY_KIND[kind],
    title, sub: `${kind[0].toUpperCase() + kind.slice(1)} · ${formatDate(b.created_at)}`,
    fare: b.final_fare ?? b.estimated_fare, status: b.status,
    footLeft: [paidBadge, haulingNeeds(b, kind), passengersChip(b, kind)].filter(Boolean).join(' '),
    actions: setFareAction + navigateAction + noShowAction + releaseAction + proofAction + nextAction,
  });
}

// The customer/order wasn't there when the rider arrived. Distinct from
// cancelling (nobody backed out — the other party just didn't show), and
// distinct from letting it silently expire (this books it as a no-show on
// the record rather than a timeout).
async function markNoShow(kind, id) {
  if (!(await appConfirm("Use this only if you arrived and the customer/order wasn't there.", { title: 'Mark as no-show?', confirmText: 'Mark no-show', danger: true, icon: 'fa-user-slash' }))) return;
  await updateStatus(kind, id, 'no_show');
}

// Can't complete this job after accepting it — release it back to the pool
// (rider_id -> null, status -> pending, per sql/010) so another rider can
// pick it up instead of the customer being stuck with a no-show.
async function releaseJob(kind, id) {
  if (!(await appConfirm("Only do this if you genuinely can't complete it.", { title: 'Release this job?', confirmText: 'Release job', danger: true, icon: 'fa-rotate-left' }))) return;
  const table = TABLE_BY_KIND[kind];
  const { error } = await supabase.from(table).update({ rider_id: null, status: 'pending' }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Job released — another rider can pick it up.', 'success');
  await loadAccepted();
  await loadRequests();
  await loadEarnings();
}

// ---- proof of delivery (food/parcel/hauling) -------------------------------
// One hidden file input, reused for whichever booking's "Take proof of
// delivery" was tapped — set by takeDeliveryProof(), read by the input's own
// change handler. Saving the photo unlocks that booking's "Mark complete".
let _proofTarget = null;

function takeDeliveryProof(kind, id) {
  _proofTarget = { kind, id };
  const input = document.getElementById('proof-upload-input');
  if (!input) { toast("Couldn't open the camera on this page — please reload.", 'error'); return; }
  input.value = '';
  input.click();
}

function wireProofUpload() {
  const input = document.getElementById('proof-upload-input');
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files[0];
    const target = _proofTarget;
    _proofTarget = null;
    if (!file || !target) return;
    const problem = photoPickProblem(file);
    if (problem) { toast(problem, 'error'); return; }

    toast('Uploading photo…', 'info');
    // Phone camera photos are often over 5MB — shrink instead of refusing.
    const photo = await shrinkImageFile(file, { max: 1600 });
    const path = `${CURRENT_PROFILE.id}/${target.kind}-${target.id}-${Date.now()}-${photo.name}`;
    const { error: upErr } = await supabase.storage.from('delivery-proof').upload(path, photo, { upsert: true });
    if (upErr) {
      console.error('Proof of delivery upload failed:', upErr.message);
      toast("The photo couldn't be uploaded — check your connection and try again.", 'error');
      return;
    }
    const delivery_proof_url = supabase.storage.from('delivery-proof').getPublicUrl(path).data.publicUrl;
    const { error } = await supabase.from(TABLE_BY_KIND[target.kind]).update({ delivery_proof_url }).eq('id', target.id);
    if (error) { toast(error.message, 'error'); return; }
    toast('Proof of delivery saved — you can now mark it complete.', 'success');
    await loadAccepted();
  });
}

// ---- receipt photo upload (food) ---------------------------------------
let _receiptTarget = null;
function adjustFoodBill(id) {
  const input = document.getElementById('ff-' + id);
  const amount = parseFloat(input?.value);
  if (!amount || amount <= 0) { toast('Enter the final fare first.', 'error'); return; }
  
  _receiptTarget = { id, amount };
  const fileInput = document.getElementById('receipt-upload-input');
  if (!fileInput) { setFinalFare('food', id, amount); return; }
  fileInput.value = '';
  fileInput.click();
}

function wireReceiptUpload() {
  const input = document.getElementById('receipt-upload-input');
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files[0];
    const target = _receiptTarget;
    _receiptTarget = null;
    if (!file || !target) return;
    if (!file.type.startsWith('image/')) { toast('Please choose an image file.', 'error'); return; }
    
    toast('Uploading receipt…', 'info');
    const path = `${CURRENT_PROFILE.id}/receipt-${target.id}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from('receipts').upload(path, file, { upsert: true });
    if (upErr) {
      console.error('Receipt upload failed:', upErr.message);
      if (!(await appConfirm("The receipt photo couldn't be uploaded.", { title: 'Confirm fare without a receipt?', confirmText: 'Confirm anyway', icon: 'fa-receipt' }))) return;
      await setFinalFare('food', target.id, target.amount);
      return;
    }
    
    const receipt_photo_url = supabase.storage.from('receipts').getPublicUrl(path).data.publicUrl;
    await supabase.from('food_deliveries').update({
      actual_food_cost: target.amount, // simplified mapping for web
      receipt_photo_url: receipt_photo_url
    }).eq('id', target.id);
    
    await setFinalFare('food', target.id, target.amount);
  });
}

// ---- "riders near you" presence toggle -------------------------------------
function setOnlineUI(isOnline) {
  RIDER_ONLINE = isOnline;
  const label = document.getElementById('online-status-label');
  const sub = document.getElementById('online-status-sub');
  const btn = document.getElementById('online-toggle-btn');
  document.getElementById('online-hero')?.classList.toggle('is-online', isOnline);
  if (label) label.textContent = isOnline ? "You're online" : "You're offline";
  if (sub) {
    sub.textContent = isOnline
      ? 'Customers nearby can see you, and new jobs for your vehicle come in.'
      : 'Go online so nearby customers can see you before they book.';
  }
  if (btn) {
    btn.setAttribute('aria-checked', isOnline ? 'true' : 'false');
    btn.setAttribute('aria-label', isOnline ? 'Go offline' : 'Go online');
  }
}

// ---- Float card ----------------------------------------------------------
async function updateFloat() {
  const input = document.getElementById('float-input');
  const amount = parseFloat(input?.value);
  if (isNaN(amount) || amount < 0) { toast('Enter a valid amount (0 or more).', 'error'); return; }
  const btn = document.getElementById('float-update-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  try {
    const { error } = await supabase.from('profiles').update({ float_amount: amount }).eq('id', CURRENT_PROFILE.id);
    if (error) throw error;
    CURRENT_PROFILE.float_amount = amount;
    const floatEl = document.getElementById('home-float-amount');
    if (floatEl) floatEl.textContent = peso(amount);
    toast('Float updated to ' + peso(amount) + '.', 'success');
    loadRequests(); // re-check the "more than your float" warnings
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Update'; }
  }
}

// Online status is shared with the mobile app (rider_locations.is_online).
// Only the device where the rider tapped "Go online" sends GPS; this flag
// remembers whether that was this browser, so a reload resumes sending only
// here and a phone that went online isn't joined by a second, different
// location from the laptop.
const ONLINE_HERE_KEY = 'itulod-online-here';
function onlineHere(value) {
  try {
    if (value === undefined) return localStorage.getItem(ONLINE_HERE_KEY) === CURRENT_PROFILE.id;
    if (value) localStorage.setItem(ONLINE_HERE_KEY, CURRENT_PROFILE.id);
    else localStorage.removeItem(ONLINE_HERE_KEY);
  } catch (_) { /* storage blocked: behave as "not this device" */ }
  return false;
}

async function initOnlineStatus() {
  const { data } = await supabase.from('rider_locations').select('is_online').eq('rider_id', CURRENT_PROFILE.id).maybeSingle();
  setOnlineUI(!!data?.is_online);
  // Resume broadcasting after a page reload — only if this browser was the
  // one that went online.
  if (data?.is_online && onlineHere() && typeof goOnline === 'function') {
    goOnline(() => { setOnlineUI(false); onlineHere(false); toast('Could not access your location — went back offline.', 'error'); });
  }
  if (!data?.is_online) onlineHere(false);
  watchOnlineStatus();
}

// Follow online/offline changes made on another device (the mobile app or
// another browser) live.
let _onlineWatchStarted = false;
function watchOnlineStatus() {
  if (_onlineWatchStarted) return;
  _onlineWatchStarted = true;
  const apply = (isOnline) => {
    if (isOnline === RIDER_ONLINE) return;
    setOnlineUI(isOnline);
    if (!isOnline) {
      // Went offline elsewhere: stop sending from here without writing.
      if (typeof stopOnlinePresence === 'function') stopOnlinePresence();
      onlineHere(false);
      toast('You went offline on another device.', 'info');
    } else {
      toast('You went online on another device.', 'info');
    }
  };
  supabase.channel(`rider-online-${CURRENT_PROFILE.id}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'rider_locations', filter: `rider_id=eq.${CURRENT_PROFILE.id}` },
      async (payload) => {
        if (payload.eventType === 'DELETE') {
          const { data } = await supabase.from('rider_locations').select('is_online').eq('rider_id', CURRENT_PROFILE.id).maybeSingle();
          apply(!!data?.is_online);
        } else {
          apply(!!payload.new?.is_online);
        }
      })
    .subscribe();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const { data } = await supabase.from('rider_locations').select('is_online').eq('rider_id', CURRENT_PROFILE.id).maybeSingle();
    apply(!!data?.is_online);
  });
}

function wireOnlineToggle() {
  const btn = document.getElementById('online-toggle-btn');
  if (!btn) return;
  if (!RIDER_APPROVED) {
    btn.disabled = true;
    btn.title = 'Available once an admin approves your application';
    return;
  }
  btn.addEventListener('click', () => {
    if (RIDER_ONLINE) {
      if (typeof goOffline === 'function') goOffline();
      onlineHere(false);
      setOnlineUI(false);
      return;
    }
    if (typeof goOnline !== 'function') return;
    onlineHere(true);
    goOnline(() => { setOnlineUI(false); onlineHere(false); toast("Couldn't access your location. Check your browser's location permission and try again.", 'error'); });
    setOnlineUI(true);
  });
}

async function setFinalFare(kind, id, amountOverride) {
  const input = document.getElementById('ff-' + id);
  const amount = amountOverride || parseFloat(input?.value);
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
  if (status === 'completed') celebrate('Trip complete!', 'Nice work — your earnings are updated.');
  else toast('Status updated!', 'success');
  await loadAccepted(); // clears RIDER_HAS_ACTIVE_BOOKING once nothing's left in progress
  await loadRequests(); // re-enable Accept buttons now that the rider is free again
  await loadEarnings();
  await loadHistory();
  await loadRiderHome();
}

// ---- earnings ----------------------------------------------------------
// Balance with iTULOD (sql/024 rider_balance): GCash/wallet fares iTULOD
// owes you, minus commission you owe on cash trips, less what's been settled.
async function loadRiderBalance() {
  const el = document.getElementById('rider-balance');
  if (!el) return;
  const { data, error } = await supabase.rpc('rider_balance');
  if (error || !data || !data.length) { el.innerHTML = ''; return; }
  const b = data[0];
  const net = Number(b.net);
  const tone = net > 0 ? 'owed' : net < 0 ? 'due' : 'even';
  const headline = net > 0 ? `iTULOD owes you ${peso(net)}`
    : net < 0 ? `You owe iTULOD ${peso(-net)}` : 'All settled';
  const detail = `${peso(b.online_earnings)} from GCash/wallet trips · ${peso(b.cash_commission)} commission on cash trips`
    + (Number(b.payouts_made) ? ` · ${peso(b.payouts_made)} paid out` : '')
    + (Number(b.collections_made) ? ` · ${peso(b.collections_made)} paid in` : '');
  el.innerHTML = `
    <div class="balance-card balance-card--${tone}">
      <div class="balance-card__icon"><i class="fa-solid fa-scale-balanced"></i></div>
      <div class="balance-card__text"><strong>${headline}</strong>${escapeHtml(detail)}</div>
    </div>
    ${Number(b.cod_unremitted) > 0 ? `
    <div class="balance-card balance-card--due">
      <div class="balance-card__icon"><i class="fa-solid fa-hand-holding-dollar"></i></div>
      <div class="balance-card__text"><strong>${peso(b.cod_unremitted)} COD to hand over</strong>Cash you collected for senders. Mark each one handed over from History → Parcels.</div>
    </div>` : ''}`;
}

async function markCodRemitted(id) {
  if (!(await appConfirm('Confirm you have handed the collected cash to the sender.', { title: 'COD handed over?', confirmText: 'Yes, handed over', cancelText: 'Not yet', icon: 'fa-money-bill-wave' }))) return;
  const { error } = await supabase.from('parcel_deliveries').update({ cod_remitted_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('COD marked as handed over. The sender has been notified.', 'success');
  loadHistory();
  loadRiderBalance();
}

async function loadEarnings() {
  loadRiderBalance();
  const { data: payments } = await supabase.from('payments').select('*').eq('rider_id', CURRENT_PROFILE.id);
  const rows = payments || [];
  EARNING_ROWS = rows.filter(r => r.status === 'paid').sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  renderPaySplit();
  renderPayRecords();
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

// ---- earnings by payment method + records ------------------------------
let EARNING_ROWS = [];
let PAY_RANGE = 'month';
let PAY_FILTER = 'all';
const PAY_METHODS = [
  ['cash', 'Cash', 'fa-money-bill-wave', 'Collected by you'],
  ['gcash', 'GCash', 'fa-mobile-screen-button', 'Paid out by iTULOD'],
  ['wallet', 'Wallet', 'fa-wallet', 'Paid out by iTULOD'],
];
const PAY_KIND_LABEL = { transport: 'Ride', food: 'Food', parcel: 'Parcel', hauling: 'Hauling' };
function payRangeStart(range) {
  const now = new Date();
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'day') return day;
  if (range === 'week') { const w = new Date(day); w.setDate(day.getDate() - day.getDay()); return w; }
  if (range === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}
function renderPaySplit() {
  const box = document.getElementById('pay-split');
  if (!box) return;
  const from = payRangeStart(PAY_RANGE);
  const inRange = EARNING_ROWS.filter(r => !from || new Date(r.created_at) >= from);
  const total = inRange.reduce((a, r) => a + Number(r.rider_payout || 0), 0);
  box.innerHTML = PAY_METHODS.map(([key, label, icon, hint]) => {
    const rows = inRange.filter(r => r.method === key);
    const earned = rows.reduce((a, r) => a + Number(r.rider_payout || 0), 0);
    const share = total > 0 ? Math.round((earned / total) * 100) : 0;
    return `<button type="button" class="pay-split__item pay-split__item--${key}" onclick="setPayFilter('${key}')" title="Show ${label} records">
      <span class="pay-split__icon"><i class="fa-solid ${icon}"></i></span>
      <span class="pay-split__label">${label}</span>
      <strong class="pay-split__amount">${peso(earned)}</strong>
      <span class="pay-split__meta">${rows.length} trip${rows.length === 1 ? '' : 's'} · ${share}%</span>
      <span class="pay-split__bar"><span style="width:${share}%"></span></span>
      <span class="pay-split__hint">${hint}</span>
    </button>`;
  }).join('');
}
function renderPayRecords() {
  const box = document.getElementById('pay-records');
  if (!box) return;
  const all = EARNING_ROWS.filter(r => PAY_FILTER === 'all' || r.method === PAY_FILTER);
  const rows = all.slice(0, 50);
  if (!rows.length) {
    box.innerHTML = emptyState({ icon: 'fa-receipt', title: 'No records yet', body: PAY_FILTER === 'all' ? 'Completed trips show up here with what you earned.' : 'No trips paid this way yet.' });
    return;
  }
  const meta = Object.fromEntries(PAY_METHODS.map(m => [m[0], m]));
  box.innerHTML = `<div class="pay-records">${rows.map(r => {
    const commission = Number(r.platform_commission || 0);
    // a cancellation / no-show fee goes to the rider whole (no commission)
    const what = commission === 0 && Number(r.amount) === Number(r.rider_payout) ? 'Fee from customer' : (PAY_KIND_LABEL[r.booking_type] || 'Trip');
    const m = meta[r.method] || [r.method, r.method || '—', 'fa-receipt'];
    return `<div class="pay-rec">
      <span class="pay-rec__icon pay-rec__icon--${escapeHtml(r.method || '')}"><i class="fa-solid ${m[2]}"></i></span>
      <div class="pay-rec__main"><strong>${escapeHtml(what)}</strong><span>${formatDate(r.created_at)} · ${escapeHtml(m[1])}</span></div>
      <div class="pay-rec__amt"><strong>+${peso(r.rider_payout)}</strong><span>Paid ${peso(r.amount)}${commission ? ' · commission ' + peso(commission) : ''}</span></div>
    </div>`;
  }).join('')}</div>${all.length > 50 ? '<p class="pay-records__more">Showing the latest 50.</p>' : ''}`;
}
function setPayFilter(method) {
  PAY_FILTER = method;
  document.querySelectorAll('#pay-records-filter .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.method === method));
  renderPayRecords();
}
function wireEarningsControls() {
  document.querySelectorAll('#pay-split-range .seg-btn').forEach(b => b.addEventListener('click', () => {
    PAY_RANGE = b.dataset.range;
    document.querySelectorAll('#pay-split-range .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    renderPaySplit();
  }));
  document.querySelectorAll('#pay-records-filter .seg-btn').forEach(b => b.addEventListener('click', () => setPayFilter(b.dataset.method)));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireEarningsControls); else wireEarningsControls();

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
  const { data, error } = await supabase.from(table).select('*').eq('rider_id', CURRENT_PROFILE.id).in('status', ['completed', 'cancelled', 'expired', 'no_show']).order('created_at', { ascending: false });
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
          body: 'Finished, cancelled, expired and no-show bookings in this category will be listed here.'
        });
    document.getElementById('history-pagination').innerHTML = '';
    return;
  }
  const { slice, totalPages } = paginate(data, HISTORY_PAGE, PAGE_SIZE);
  list.innerHTML = slice.map(b => {
    const title = HISTORY_KIND === 'food' ? b.restaurant_name
      : HISTORY_KIND === 'parcel' ? `${b.sender_name} → ${b.receiver_name}`
      : bookingTitle(b, HISTORY_KIND);
    return `
      <div class="booking-card" role="button" tabindex="0" onclick="openBookingDetails({ kind: '${HISTORY_KIND}', id: '${b.id}' })" onkeydown="if(event.key==='Enter'||event.key===' '){ openBookingDetails({ kind: '${HISTORY_KIND}', id: '${b.id}' }); }">
        <div class="kind-icon" style="background:${COLOR_BY_KIND[HISTORY_KIND]}"><i class="fa-solid ${ICON_BY_KIND[HISTORY_KIND]}"></i></div>
        <div class="info"><div><h4>${escapeHtml(title)}</h4><p>${formatDate(b.created_at)}${b.rating ? ' · ' + '★'.repeat(b.rating) : ''}</p></div></div>
        <div class="meta"><span class="fare">${peso(b.final_fare ?? b.estimated_fare)}</span>${b.tip_amount ? `<span class="tip-badge">+${peso(b.tip_amount)} tip</span>` : ''}${statusBadge(b.status)}${HISTORY_KIND === 'parcel' && b.status === 'completed' && Number(b.cod_amount) > 0
          ? (b.cod_remitted_at
              ? `<span class="badge badge--completed">COD ${peso(b.cod_amount)} handed over</span>`
              : `<button class="btn btn-outline btn-sm" onclick="event.stopPropagation(); markCodRemitted('${b.id}')"><i class="fa-solid fa-hand-holding-dollar"></i> COD ${peso(b.cod_amount)} handed over</button>`)
          : ''}</div>
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
      ${data.notes ? `<div style="background:var(--slate-50);padding:12px;border-radius:var(--radius-xs);font-size:var(--fs-sm)">Admin note: ${escapeHtml(data.notes)}</div>` : ''}
    </div>
    <h4 class="rider-docs__title"><i class="fa-solid fa-folder-open"></i> Uploaded documents</h4>
    <div class="rider-docs" id="rider-docs">${skeletonList(1)}</div>`;
  renderRiderDocs(data);
}

// The documents uploaded at sign-up. rider-documents is a private bucket, so
// each one is shown through a short-lived signed link (riders may read their
// own folder); a click opens it full size in a new tab.
const RIDER_DOCS = [['license_url', "Driver's license"], ['or_cr_url', 'OR / CR'], ['selfie_url', 'Selfie'], ['vehicle_url', 'Vehicle photo'], ['nbi_url', 'NBI clearance']];
async function renderRiderDocs(app) {
  const box = document.getElementById('rider-docs');
  if (!box) return;
  const pathOf = (url) => (url && url.includes('/rider-documents/'))
    ? decodeURIComponent(url.split('/rider-documents/')[1].split('?')[0]) : null;
  const items = RIDER_DOCS.map(([col, label]) => ({ label, path: pathOf(app[col]) }));
  const paths = items.filter(i => i.path).map(i => i.path);
  let signed = {};
  if (paths.length) {
    const { data } = await supabase.storage.from('rider-documents').createSignedUrls(paths, 3600);
    for (const s of data || []) if (s.signedUrl) signed[s.path] = s.signedUrl;
  }
  box.innerHTML = items.map(({ label, path }) => {
    const url = path && signed[path];
    const pdf = path && /\.pdf$/i.test(path);
    const thumb = !path
      ? '<span class="rider-doc__empty"><i class="fa-solid fa-ban"></i> Not uploaded</span>'
      : !url
        ? '<span class="rider-doc__empty"><i class="fa-solid fa-circle-exclamation"></i> Couldn&rsquo;t load</span>'
        : pdf
          ? '<span class="rider-doc__empty"><i class="fa-solid fa-file-pdf"></i> PDF</span>'
          : `<img src="${escapeHtml(url)}" alt="${escapeHtml(label)}" loading="lazy">`;
    const inner = `<span class="rider-doc__thumb">${thumb}</span><span class="rider-doc__label">${escapeHtml(label)}</span>
      <span class="rider-doc__hint">${url ? '<i class="fa-solid fa-arrow-up-right-from-square"></i> View' : path ? '' : 'Optional / not provided'}</span>`;
    return url
      ? `<a class="rider-doc" href="${escapeHtml(url)}" target="_blank" rel="noopener">${inner}</a>`
      : `<div class="rider-doc rider-doc--none">${inner}</div>`;
  }).join('');
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hauling_bookings' }, refresh)
    .subscribe();
}
