/**
 * iTULOD — admin dashboard
 */
let CURRENT_PROFILE = null;
let ALL_CUSTOMERS = [];
let BOOKING_KIND = 'transport';
let ACTIVE_APPLICATION = null;
let BOOKINGS_PAGE = 1;
let PAYMENTS_PAGE = 1;
let ALL_PAYMENTS = [];
const ADMIN_PAGE_SIZE = 10;
const TABLE_BY_KIND = { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries', hauling: 'hauling_bookings' };

(async function init() {
  CURRENT_PROFILE = await requireSession(['admin']);
  if (!CURRENT_PROFILE) return;

  renderAccountMenus(CURRENT_PROFILE); // name, Dark mode and Log out live in the profile picture menu

  wireTabNav();
  wireRiderSubTabs();
  wireBookingTabs();
  wireCustomerSearch();
  wireVehicleForm();
  wireVehicleClicks();
  wireRestaurantForm();
  wireMenuItemForm();
  wireCatalogUploads();
  wireAnnouncementForm();
  wireSupportSubTabs();
  wireSettingsForm();
  wireChartRange();
  wirePaymentFilters();
  restoreView(); // a refresh stays on the section you were on
  loadWaitingBookingCounts(); // the sidebar counts show at once, not after every list loads
  loadRiderClaims();

  await loadAnalytics();
  await loadCustomers();
  await loadPendingApplications();
  await loadPhotoReviews();
  await loadAllRiders();
  await loadVehicles();
  await loadRestaurants();
  await loadSupportRequests();
  await loadBookings();
  await loadPayments();
  await loadRiderBalances();
  await loadAnnouncements();
  await loadSettings();
  subscribeRealtime();
})();

function initials(name) { return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }

// ---- tab nav ---------------------------------------------------------
const TAB_TITLES = {
  analytics: ['Dashboard analytics', 'Platform overview at a glance.'],
  customers: ['Customers', 'All registered customers.'],
  riders: ['Riders & applications', 'Approve riders and manage the fleet.'],
  vehicles: ['Vehicle categories', 'Manage available vehicle types and fares.'],
  restaurants: ['Restaurants', 'Manage restaurants and their menus for food delivery.'],
  support: ['Support requests', 'Refunds, disputes, and everything else customers flag.'],
  bookings: ['Bookings & deliveries', 'Monitor all activity across the platform.'],
  payments: ['Payments', 'Transactions, commissions, and payouts.'],
  announcements: ['Announcements', 'Broadcast messages to your users.'],
  settings: ['Settings', 'Platform configuration.']
};
function activateTab(name) {
  const titles = TAB_TITLES[name];
  if (!titles || !document.getElementById('tab-' + name)) return;
  document.querySelectorAll('.side-link[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  Object.keys(TAB_TITLES).forEach(t => document.getElementById('tab-' + t)?.classList.toggle('active', t === name));
  document.getElementById('page-title').textContent = titles[0];
  document.getElementById('page-sub').textContent = titles[1];
  writeViewHash(name); // a refresh comes back here
  closeSidebar();
}
function wireTabNav() {
  document.querySelectorAll('.side-link[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });
}

// After a refresh: reopen the section in the address (#vehicles) and the
// chart range / list tabs chosen before (utils.js viewState). Runs before the
// first loads, so the lists load once, already filtered.
function restoreView() {
  const { tab } = readViewHash();
  if (tab && tab !== 'analytics') activateTab(tab);
  const pick = (selector, attr, value) => {
    const btn = value && document.querySelector(`${selector}[${attr}="${value}"]`);
    if (btn) document.querySelectorAll(selector).forEach(b => {
      b.classList.toggle('active', b === btn);
      if (b.hasAttribute('aria-selected')) b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    return !!btn;
  };
  const days = viewState('chart-days');
  if (pick('#chart-range .seg-btn', 'data-days', days)) CHART_DAYS = Number(days);
  const kind = viewState('booking-kind');
  if (pick('.tab-btn[data-booking-kind]', 'data-booking-kind', kind)) BOOKING_KIND = kind;
  const support = viewState('support-tab');
  if (pick('.tab-btn[data-support-tab]', 'data-support-tab', support)) SUPPORT_TAB = support;
  const riders = viewState('rider-tab');
  if (pick('.tab-btn[data-rider-tab]', 'data-rider-tab', riders)) {
    document.querySelectorAll('#rider-pending, #rider-all').forEach(p => p.classList.toggle('active', p.id === 'rider-' + riders));
  }
}

// ---- platform settings (sql/034) -----------------------------------------
async function loadSettings() {
  const form = document.getElementById('settings-form');
  if (!form) return;
  const { data: c, error } = await supabase.from('platform_config').select('*').single();
  if (error || !c) { toast('Could not load settings: ' + (error?.message || 'not found'), 'error'); return; }
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  set('set-commission', Math.round(Number(c.commission_rate) * 1000) / 10);
  set('set-cancel-fee', Number(c.cancellation_fee));
  set('set-helper-fee', Number(c.hauling_helper_fee));
  set('set-fare-min', Number(c.fare_min));
  set('set-fare-max', Number(c.fare_max_multiplier));
  set('set-debt-limit', Number(c.rider_debt_limit ?? 500));
  set('set-phone', c.support_phone);
  set('set-email', c.support_email);
  set('set-office', c.office_address);
  const upd = document.getElementById('settings-updated');
  if (upd) upd.textContent = c.updated_at ? 'Last changed ' + formatDate(c.updated_at) : '';
}

function wireSettingsForm() {
  const form = document.getElementById('settings-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const num = (id) => Number(document.getElementById(id).value);
    const text = (id) => document.getElementById(id).value.trim() || null;
    const values = {
      commission: num('set-commission'), cancel: num('set-cancel-fee'), helper: num('set-helper-fee'),
      fareMin: num('set-fare-min'), fareMax: num('set-fare-max'), debtLimit: num('set-debt-limit'),
    };
    const limits = [
      ['Platform commission', values.commission, 0, 50, '%'],
      ['Cancellation fee', values.cancel, 0, 1000, '₱'],
      ['Hauling helper fee', values.helper, 0, 5000, '₱'],
      ['Minimum fare', values.fareMin, 0, 1000, '₱'],
      ['Final fare limit', values.fareMax, 1, 10, '×'],
      ['Rider debt limit', values.debtLimit, 0, 100000, '₱'],
    ];
    for (const [label, v, lo, hi, unit] of limits) {
      if (!Number.isFinite(v) || v < lo || v > hi) {
        toast(`${label} must be between ${unit === '₱' ? '₱' + lo : lo} and ${unit === '₱' ? '₱' + hi : hi + unit}.`, 'error');
        return;
      }
    }
    const email = text('set-email');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid support email.', 'error'); return; }
    const ok = await appConfirm(
      `Commission ${values.commission}% · cancellation fee ${peso(values.cancel)} · helper fee ${peso(values.helper)}. These apply to bookings completed from now on.`,
      { title: 'Save platform settings?', confirmText: 'Save', icon: 'fa-sliders' });
    if (!ok) return;
    const btn = document.getElementById('settings-save');
    setLoading(btn, true);
    const { error } = await supabase.from('platform_config').update({
      commission_rate: Math.round(values.commission * 10) / 1000,
      cancellation_fee: values.cancel,
      hauling_helper_fee: values.helper,
      fare_min: values.fareMin,
      fare_max_multiplier: values.fareMax,
      rider_debt_limit: values.debtLimit,
      support_phone: text('set-phone'),
      support_email: email,
      office_address: text('set-office'),
    }).eq('id', true);
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Settings saved.', 'success');
    await loadSettings();
  });
}

// ---- analytics ----------------------------------------------------------
// Revenue + bookings per day for the chosen period (7 or 30 days). The data
// is fetched once by loadAnalytics; switching the period only redraws.
let ANALYTICS_DATA = null;
let CHART_DAYS = 7;

function wireChartRange() {
  const host = document.getElementById('chart-range');
  if (!host) return;
  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    CHART_DAYS = Number(btn.dataset.days) || 7;
    viewState('chart-days', CHART_DAYS);
    host.querySelectorAll('.seg-btn').forEach((b) => {
      b.classList.toggle('active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });
    renderAnalyticsCharts();
  });
}

// One bar per day. Dense (30-day) charts drop the value captions and label
// every 5th day; every bar keeps a hover title with the exact value.
function drawBarChart(chartId, labelsId, days, values, fmt) {
  const dense = days.length > 10;
  const max = Math.max(1, ...values);
  const chart = document.getElementById(chartId);
  chart.classList.toggle('bar-chart--dense', dense);
  chart.innerHTML = values.map((v, i) => {
    const day = days[i].toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
    return `<div class="bar" style="height:${Math.max(4, (v / max) * 100)}%" title="${day}: ${fmt(v)}"><span>${!dense && v > 0 ? fmt(v) : ''}</span></div>`;
  }).join('');
  const labels = document.getElementById(labelsId);
  labels.classList.toggle('bar-labels--dense', dense);
  labels.innerHTML = days.map((d, i) => {
    if (!dense) return `<span>${d.toLocaleDateString('en-PH', { weekday: 'short' })}</span>`;
    const show = i === days.length - 1 || (days.length - 1 - i) % 5 === 0;
    return `<span>${show ? d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : ''}</span>`;
  }).join('');
}

function renderAnalyticsCharts() {
  if (!ANALYTICS_DATA) return;
  const { pays, bookings } = ANALYTICS_DATA;
  const n = CHART_DAYS;
  const days = [...Array(n)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (n - 1 - i)); return d; });
  const start = days[0].getTime();
  const sameDay = (iso, d) => new Date(iso).toDateString() === d.toDateString();
  const inRange = (iso) => new Date(iso).getTime() >= start;

  const revenue = days.map(d => pays.filter(p => sameDay(p.created_at, d))
    .reduce((a, p) => a + Number(p.platform_commission || 0), 0));
  const created = days.map(d => bookings.filter(b => sameDay(b.created_at, d)).length);
  drawBarChart('revenue-chart', 'revenue-labels', days, revenue, peso);
  drawBarChart('bookings-chart', 'bookings-labels', days, created, (v) => String(v));

  const revTotal = revenue.reduce((a, v) => a + v, 0);
  document.getElementById('revenue-range-total').textContent = peso(revTotal);
  document.getElementById('bookings-range-total').textContent = created.reduce((a, v) => a + v, 0);
  document.querySelectorAll('[data-range-label]').forEach((el) => { el.textContent = `last ${n} days`; });

  // "In this period" — bookings created in the period, commission earned in it.
  const recent = bookings.filter(b => inRange(b.created_at));
  const done = recent.filter(b => b.status === 'completed');
  const commissionRows = pays.filter(p => inRange(p.created_at) && Number(p.platform_commission || 0) > 0);
  document.getElementById('rs-completed').textContent = done.length;
  const cancelled = recent.filter(b => b.status === 'cancelled').length;
  document.getElementById('rs-cancelled').textContent = recent.length
    ? `${cancelled} (${Math.round((cancelled / recent.length) * 100)}%)`
    : '0';
  document.getElementById('rs-fares').textContent = peso(done.reduce((a, b) => a + Number(b.final_fare || 0), 0));
  document.getElementById('rs-avg').textContent = commissionRows.length ? peso(revTotal / commissionRows.length) : '—';
}

async function loadAnalytics() {
  const [{ count: customerCount }, { count: riderCount }, { count: pendingApps }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('rider_applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
    supabase.from('rider_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  ]);

  const allBookings = (await Promise.all(Object.values(TABLE_BY_KIND).map(t => supabase.from(t).select('status, final_fare, created_at'))))
    .flatMap(r => r.data || []);

  const completed = allBookings.filter(b => b.status === 'completed').length;
  // Revenue is iTULOD's cut — the commission in the payments ledger — not
  // the fares customers paid (most of that is the riders' money).
  // Cancellation-fee rows carry no commission, so they add nothing here.
  const { data: payRows } = await supabase.from('payments').select('platform_commission, created_at');
  const pays = payRows || [];
  const revenue = pays.reduce((a, p) => a + Number(p.platform_commission || 0), 0);
  const faresTotal = allBookings.reduce((a, b) => a + (b.status === 'completed' ? Number(b.final_fare || 0) : 0), 0);

  // Update the static stat card elements in the HTML
  const sc = document.getElementById('stat-customers'); if (sc) sc.textContent = customerCount ?? 0;
  const sr = document.getElementById('stat-riders');    if (sr) sr.textContent = riderCount ?? 0;
  const sb = document.getElementById('stat-bookings');  if (sb) sb.textContent = allBookings.length;
  const sv = document.getElementById('stat-revenue');   if (sv) sv.textContent = peso(revenue);
  const svs = document.getElementById('stat-revenue-sub');
  if (svs) svs.textContent = `from ${peso(faresTotal)} in fares`;

  ANALYTICS_DATA = { pays, bookings: allBookings };
  renderAnalyticsCharts();

  // status breakdown — donut chart + legend
  const statuses = ['pending', 'completed', 'cancelled', 'ongoing', 'accepted'];
  const statusColors = { pending: '#d98e04', completed: '#1a9d63', cancelled: '#e0455f', ongoing: '#2196f3', accepted: '#9aa6b2' };
  const counts = {};
  statuses.forEach(s => counts[s] = allBookings.filter(b => b.status === s).length);
  const total = allBookings.length || 1;
  let cumulativePct = 0;
  const gradientStops = statuses.map(s => {
    const pct = (counts[s] / total) * 100;
    const stop = `${statusColors[s]} ${cumulativePct.toFixed(1)}% ${(cumulativePct + pct).toFixed(1)}%`;
    cumulativePct += pct;
    return stop;
  }).join(', ');
  const donutEl = document.getElementById('donut-chart-el');
  if (donutEl) donutEl.style.background = `conic-gradient(${gradientStops})`;
  statuses.forEach(s => {
    const el = document.getElementById('leg-' + s);
    if (el) el.textContent = counts[s];
  });
}

// ---- customers ----------------------------------------------------------
async function loadCustomers() {
  showSkeleton(document.querySelector('#customers-table tbody'), skeletonRows(5, 6));
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'customer').order('created_at', { ascending: false });
  ALL_CUSTOMERS = data || [];
  renderCustomers(ALL_CUSTOMERS);
  if (error) toast(error.message, 'error');
}
function renderCustomers(rows) {
  const tbody = document.querySelector('#customers-table tbody');
  if (rows.length === 0) {
    // This renderer serves both the full list and the search filter, so the
    // message has to say which of the two came back empty.
    const searching = (document.getElementById('customer-search')?.value || '').trim() !== '';
    tbody.innerHTML = `<tr><td colspan="6">${emptyState({
      icon: searching ? 'fa-magnifying-glass' : 'fa-users',
      title: searching ? 'No matches' : 'No customers yet',
      body: searching
        ? 'No customer name or email matches what you typed.'
        : 'Customer accounts appear here as people register.'
    })}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(c => `
    <tr>
      <td>${escapeHtml(c.full_name)}</td><td>${escapeHtml(c.email)}</td><td>${escapeHtml(c.phone || '—')}</td>
      <td>${formatDate(c.created_at)}</td>
      <td>${c.is_active ? '<span class="badge badge--completed">Active</span>' : '<span class="badge badge--cancelled">Suspended</span>'}</td>
      <td><div class="row-actions"><button class="icon-btn" title="${c.is_active ? 'Suspend' : 'Reactivate'}" onclick="toggleUserActive('${c.id}', ${c.is_active})"><i class="fa-solid ${c.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i></button></div></td>
    </tr>`).join('');
}
function wireCustomerSearch() {
  document.getElementById('customer-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    renderCustomers(ALL_CUSTOMERS.filter(c => c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
  });
}
async function toggleUserActive(id, currentlyActive) {
  const { error } = await supabase.from('profiles').update({ is_active: !currentlyActive }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast(currentlyActive ? 'Account suspended.' : 'Account reactivated.', 'success');
  loadCustomers(); loadAllRiders();
}

// ---- rider applications ---------------------------------------------------
function wireRiderSubTabs() {
  document.querySelectorAll('.tab-btn[data-rider-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-rider-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#rider-pending, #rider-all').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('rider-' + btn.dataset.riderTab).classList.add('active');
      viewState('rider-tab', btn.dataset.riderTab);
    });
  });
}

async function loadPendingApplications() {
  const el = document.getElementById('pending-applications');

  // Show loading state
  showSkeleton(el, skeletonList(2));

  // Step 1: Fetch pending applications
  const { data: apps, error: appsError } = await supabase
    .from('rider_applications')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (appsError) {
    console.error('loadPendingApplications error:', appsError);
    el.innerHTML = emptyState({
      icon: 'fa-triangle-exclamation',
      title: 'Could not load applications',
      body: appsError.message,
      tone: 'error'
    });
    // Update the badge to show error state
    updatePendingBadge(0);
    return;
  }

  // Update the live count badge on the Pending tab button
  updatePendingBadge(apps ? apps.length : 0);

  if (!apps || apps.length === 0) {
    el.innerHTML = `<div class="card">${emptyState({
      icon: 'fa-circle-check',
      title: 'All clear!',
      body: 'No pending rider applications to review right now.',
      tone: 'success'
    })}</div>`;
    return;
  }

  // Step 2: Fetch rider profiles for those applications (bypass FK join for reliability)
  const riderIds = [...new Set(apps.map(a => a.rider_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, avatar_url, created_at')
    .in('id', riderIds);

  if (profilesError) {
    console.error('loadPendingApplications profiles error:', profilesError);
  }

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  // Merge profile data into each application
  const enriched = apps.map(app => ({ ...app, rider: profileMap[app.rider_id] || null }));

  el.innerHTML = enriched.map(app => {
    const rider = app.rider;
    const name = rider?.full_name || 'Unknown Rider';
    const email = rider?.email || '—';
    const phone = rider?.phone || '—';
    const submittedDate = formatDate(app.created_at);
    return `
    <div class="booking-card" style="cursor:default">
      <div class="kind-icon" style="background:var(--blue)"><i class="fa-solid fa-id-card"></i></div>
      <div class="info">
        <div>
          <h4>${escapeHtml(name)}</h4>
          <p>${escapeHtml(app.vehicle_type)}${app.vehicle_plate ? ' · ' + escapeHtml(app.vehicle_plate) : ''}</p>
          <p style="color:var(--text-muted);font-size:var(--fs-xs)">${escapeHtml(email)} · ${escapeHtml(phone)} · Applied ${submittedDate}</p>
        </div>
      </div>
      <div class="meta">
        <span class="badge badge--pending" style="margin-right:8px">Pending</span>
        <button class="btn btn-primary btn-sm" onclick='openAppModal(${JSON.stringify(app).replace(/'/g, "&#39;")})'>
          <i class="fa-solid fa-eye"></i> Review
        </button>
      </div>
    </div>`;
  }).join('');
}

let PENDING_APP_COUNT = 0;
let PHOTO_REVIEW_IDS = new Set();
function updatePendingBadge(count) {
  // The badge counts new applications plus photo changes waiting for review.
  if (count !== undefined) PENDING_APP_COUNT = count;
  count = PENDING_APP_COUNT + PHOTO_REVIEW_IDS.size;
  setNavCount('riders', count);
  // Find the Pending applications tab button and update/add a count badge
  const pendingBtn = document.querySelector('.tab-btn[data-rider-tab="pending"]');
  if (!pendingBtn) return;
  // Remove any existing badge
  const existingBadge = pendingBtn.querySelector('.pending-count');
  if (existingBadge) existingBadge.remove();
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'pending-count';
    badge.textContent = count;
    badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:var(--red,#ef4444);color:#fff;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:700;margin-left:6px;';
    pendingBtn.appendChild(badge);
  }
}

function openAppModal(app) {
  ACTIVE_APPLICATION = app;
  const rider = app.rider;
  const name = rider?.full_name || '—';
  const initials_ = initials(name);
  const avatarHtml = rider?.avatar_url
    ? `<img src="${rider.avatar_url}" alt="Avatar" style="width:64px;height:64px;border-radius:50%;object-fit:cover;border:2px solid var(--border)">`
    : `<div style="width:64px;height:64px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:var(--fs-2xl);font-weight:700;color:#fff">${initials_}</div>`;

  document.getElementById('app-modal-body').innerHTML = `
    <!-- Rider Profile Header -->
    <div style="display:flex;align-items:center;gap:14px;padding:16px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:16px">
      ${avatarHtml}
      <div>
        <div style="font-size:var(--fs-lg);font-weight:700;color:var(--ink)">${escapeHtml(name)}</div>
        <div style="font-size:var(--fs-sm);color:var(--text-muted)">${escapeHtml(rider?.email || '—')}</div>
        <div style="font-size:var(--fs-sm);color:var(--text-muted)">${escapeHtml(rider?.phone || 'No phone on file')}</div>
        <div style="margin-top:4px"><span class="badge badge--pending">Pending Review</span></div>
      </div>
    </div>

    <!-- Application Details -->
    <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Vehicle Information</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:2px">Vehicle Type</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.vehicle_type || '—')}</div>
      </div>
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:2px">Vehicle Model</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.vehicle_model || '—')}</div>
      </div>
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:2px">Plate Number</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.vehicle_plate || '—')}</div>
      </div>
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:var(--fs-xs);color:var(--text-muted);margin-bottom:2px">License Number</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.license_number || '—')}</div>
      </div>
    </div>

    <!-- Documents -->
    <div style="font-size:var(--fs-sm);font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Documents</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${app.license_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-id-card" style="color:var(--blue)"></i>
               <div><div style="font-size:var(--fs-sm);font-weight:600">Driver's License</div><div style="font-size:var(--fs-xs);color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.license_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:var(--fs-sm)"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No driver's license uploaded</div>`
      }
      ${app.or_cr_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-file-lines" style="color:var(--orange)"></i>
               <div><div style="font-size:var(--fs-sm);font-weight:600">OR/CR (Vehicle Registration)</div><div style="font-size:var(--fs-xs);color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.or_cr_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:var(--fs-sm)"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No OR/CR uploaded</div>`
      }
      ${app.selfie_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-camera" style="color:var(--blue)"></i>
               <div><div style="font-size:var(--fs-sm);font-weight:600">Selfie Verification</div><div style="font-size:var(--fs-xs);color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.selfie_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:var(--fs-sm)"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No selfie uploaded</div>`
      }
      ${app.vehicle_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-motorcycle" style="color:var(--orange)"></i>
               <div><div style="font-size:var(--fs-sm);font-weight:600">Vehicle Photo</div><div style="font-size:var(--fs-xs);color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.vehicle_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:var(--fs-sm)"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No vehicle photo uploaded</div>`
      }
      ${app.nbi_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-shield-halved" style="color:var(--blue)"></i>
               <div><div style="font-size:var(--fs-sm);font-weight:600">NBI Clearance</div><div style="font-size:var(--fs-xs);color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.nbi_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:var(--fs-sm)"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No NBI clearance uploaded (optional)</div>`
      }
    </div>

    <!-- Metadata -->
    <div style="font-size:var(--fs-xs);color:var(--text-muted);border-top:1px solid var(--border);padding-top:10px">
      <i class="fa-regular fa-clock" style="margin-right:4px"></i>Application submitted: <strong>${formatDate(app.created_at)}</strong>
      &nbsp;·&nbsp; Application ID: <code style="font-size:var(--fs-xs);background:var(--bg);padding:2px 6px;border-radius:4px">${app.id}</code>
    </div>
  `;
  wireRiderDocLinks(document.getElementById('app-modal-body'));
  document.getElementById('app-modal').classList.add('open');
}

function closeAppModal() { document.getElementById('app-modal').classList.remove('open'); }

// rider-documents is a private bucket, so the public URLs saved at sign-up
// don't open. Swap each link for a short-lived signed URL when clicked.
function wireRiderDocLinks(root) {
  root.querySelectorAll('a[href*="/rider-documents/"]').forEach(a => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const path = decodeURIComponent((a.getAttribute('href').split('/rider-documents/')[1] || '').split('?')[0]);
      const win = window.open('', '_blank');
      const { data, error } = await supabase.storage.from('rider-documents').createSignedUrl(path, 300);
      if (error || !data?.signedUrl) {
        win?.close();
        toast('Could not open that document: ' + (error?.message || 'file not found'), 'error');
        return;
      }
      if (win) win.location.href = data.signedUrl;
      else window.open(data.signedUrl, '_blank');
    });
  });
}

// ---- rider photo changes ---------------------------------------------------
// An approved rider's new profile photo waits in avatar_pending_url until an
// admin approves it here (sql/030) — customers see the rider's photo on their
// booking, so it must still be the person who was approved.
async function loadPhotoReviews() {
  const el = document.getElementById('photo-reviews');
  if (!el) return;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, phone, avatar_url, avatar_pending_url')
    .eq('role', 'rider')
    .not('avatar_pending_url', 'is', null)
    .order('updated_at', { ascending: false });
  if (error) { console.warn('loadPhotoReviews:', error.message); return; }
  PHOTO_REVIEW_IDS = new Set((data || []).map(p => p.id));
  updatePendingBadge();
  if (!data || !data.length) { el.innerHTML = ''; return; }

  const photo = (url, cls, name) => safeImageUrl(url)
    ? `<img src="${escapeHtml(url)}" alt="" class="${cls}">`
    : `<div class="photo-review__none">${escapeHtml(initials(name))}</div>`;
  el.innerHTML = `
    <div class="card" style="margin-bottom:16px">
      <div class="card-head"><h3><i class="fa-solid fa-user-pen" style="color:var(--orange);margin-right:6px"></i>Profile photo changes to review (${data.length})</h3></div>
      <p style="color:var(--text-muted);font-size:var(--fs-sm);margin:0 0 12px">Approved riders who uploaded a new photo. Check it's the same person — customers see this photo on their booking.</p>
      ${data.map(p => `
        <div class="booking-card photo-review" style="cursor:default">
          <div class="photo-review__pair">
            <figure>${photo(p.avatar_url, '', p.full_name)}<figcaption>Current</figcaption></figure>
            <i class="fa-solid fa-arrow-right photo-review__arrow"></i>
            <figure><a href="${escapeHtml(p.avatar_pending_url)}" target="_blank" rel="noopener">${photo(p.avatar_pending_url, 'is-new', p.full_name)}</a><figcaption>New</figcaption></figure>
          </div>
          <div class="photo-review__info">
            <h4>${escapeHtml(p.full_name || 'Rider')}</h4>
            <p>${escapeHtml(p.phone || 'No phone on file')}</p>
          </div>
          <div class="photo-review__actions">
            <button class="btn btn-success btn-sm" onclick="reviewRiderPhoto('${p.id}', true, this)"><i class="fa-solid fa-check"></i> Approve</button>
            <button class="btn btn-danger btn-sm" onclick="reviewRiderPhoto('${p.id}', false, this)"><i class="fa-solid fa-xmark"></i> Reject</button>
          </div>
        </div>`).join('')}
    </div>`;
}

async function reviewRiderPhoto(riderId, approve, btn) {
  if (!approve && !(await appConfirm('The rider keeps their current photo and is asked to upload a clear photo of their face.', { title: 'Reject this photo?', confirmText: 'Reject photo', danger: true, icon: 'fa-user-xmark' }))) return;
  if (btn) setLoading(btn, true);
  const { error } = await supabase.rpc('review_rider_photo', { p_rider: riderId, p_approve: approve });
  if (btn) setLoading(btn, false);
  if (error) { toast(error.message, 'error'); return; }
  toast(approve ? 'Photo approved — customers now see the new photo.' : 'Photo rejected — the rider was notified.', approve ? 'success' : 'info');
  await Promise.all([loadPhotoReviews(), loadAllRiders()]);
}

async function decideApplication(status) {
  if (!ACTIVE_APPLICATION) return;

  const approveBtn = document.querySelector('#app-modal .btn-success');
  const rejectBtn = document.querySelector('#app-modal .btn-danger');
  if (approveBtn) setLoading(approveBtn, true);
  if (rejectBtn) rejectBtn.disabled = true;

  // Update the application status
  const { error } = await supabase
    .from('rider_applications')
    .update({ status, reviewed_by: CURRENT_PROFILE.id, reviewed_at: new Date().toISOString() })
    .eq('id', ACTIVE_APPLICATION.id);

  if (approveBtn) setLoading(approveBtn, false);
  if (rejectBtn) rejectBtn.disabled = false;

  if (error) { toast(error.message, 'error'); return; }

  // Send notification to the rider
  await supabase.from('notifications').insert({
    user_id: ACTIVE_APPLICATION.rider_id,
    title: status === 'approved' ? 'Application approved! 🎉' : 'Application update',
    message: status === 'approved'
      ? 'Congratulations! Your rider application has been approved. You can now accept booking requests.'
      : 'Your rider application was not approved at this time. Please contact support for details.'
  });

  toast(
    status === 'approved' ? 'Rider approved! They will now appear in All Riders.' : 'Application rejected.',
    status === 'approved' ? 'success' : 'error'
  );
  closeAppModal();

  // Refresh both tabs and analytics so counts reflect the new state
  await Promise.all([
    loadPendingApplications(),
    loadAllRiders(),
    loadAnalytics()
  ]);
}
async function loadAllRiders() {
  const tbody = document.querySelector('#riders-table tbody');
  showSkeleton(tbody, skeletonRows(5, 6));

  // Step 1: Fetch only approved rider applications
  const { data: approvedApps, error: appsError } = await supabase
    .from('rider_applications')
    .select('rider_id, vehicle_type, vehicle_plate, status, created_at')
    .eq('status', 'approved')
    .order('created_at', { ascending: false });

  if (appsError) {
    console.error('loadAllRiders apps error:', appsError);
    tbody.innerHTML = `<tr><td colspan="6">${emptyState({
      icon: 'fa-triangle-exclamation',
      title: 'Could not load riders',
      body: appsError.message,
      tone: 'error'
    })}</td></tr>`;
    return;
  }

  if (!approvedApps || approvedApps.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">${emptyState({
      icon: 'fa-motorcycle',
      title: 'No approved riders yet',
      body: 'Approve an application from the Pending tab and the rider will show up here.'
    })}</td></tr>`;
    return;
  }

  // Step 2: Fetch profiles for these approved riders
  const riderIds = [...new Set(approvedApps.map(a => a.rider_id))];
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, avatar_url, is_active, created_at')
    .in('id', riderIds);

  if (profilesError) {
    console.error('loadAllRiders profiles error:', profilesError);
  }

  const profileMap = {};
  (profiles || []).forEach(p => { profileMap[p.id] = p; });

  // Step 3: Fetch reviews for ratings
  const { data: allReviews } = await supabase
    .from('reviews')
    .select('rider_id, rating')
    .in('rider_id', riderIds);

  const reviewMap = {};
  (allReviews || []).forEach(rv => {
    if (!reviewMap[rv.rider_id]) reviewMap[rv.rider_id] = [];
    reviewMap[rv.rider_id].push(rv.rating);
  });

  // Build display rows — one row per approved application
  const rows = approvedApps.map(app => {
    const profile = profileMap[app.rider_id] || {};
    const ratings = reviewMap[app.rider_id] || [];
    const avg = ratings.length
      ? (ratings.reduce((a, x) => a + x, 0) / ratings.length).toFixed(1)
      : '—';
    const isActive = profile.is_active ?? true;
    return `<tr>
      <td>${escapeHtml(profile.full_name || '—')}</td>
      <td>
        <select class="rider-vehicle-select" onchange="changeRiderVehicle('${app.rider_id}', this.value, this)">
          ${RIDER_VEHICLE_TYPES.map(t => `<option ${t === app.vehicle_type ? 'selected' : ''}>${t}</option>`).join('')}
        </select>
        ${HAULING_VEHICLE_TYPES.includes(app.vehicle_type) ? '<span class="badge badge--pending" style="margin-left:6px">Hauling</span>' : ''}
      </td>
      <td>${statusBadge('approved')}</td>
      <td>${avg !== '—' ? avg + ' ★' : '—'}</td>
      <td>${formatDate(profile.created_at)}</td>
      <td><div class="row-actions"><button class="icon-btn" title="${isActive ? 'Suspend' : 'Reactivate'}" onclick="toggleUserActive('${app.rider_id}', ${isActive})"><i class="fa-solid ${isActive ? 'fa-user-slash' : 'fa-user-check'}"></i></button></div></td>
    </tr>`;
  });

  tbody.innerHTML = rows.join('');
}

// ---- vehicles -------------------------------------------------------------
let ALL_VEHICLES = [];
async function loadVehicles() {
  showSkeleton(document.querySelector('#vehicles-table tbody'), skeletonRows(5, 6));
  const { data, error } = await supabase.from('vehicles').select('*').order('base_fare');
  if (error) { console.error('loadVehicles error:', error); toast(error.message, 'error'); }
  ALL_VEHICLES = data || [];
  const tbody = document.querySelector('#vehicles-table tbody');
  if (ALL_VEHICLES.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyState({
      icon: 'fa-car',
      title: 'No vehicle categories',
      body: 'Add a category so customers have something to book.'
    })}</td></tr>`;
    return;
  }
  tbody.innerHTML = ALL_VEHICLES.map(v => `
    <tr class="is-clickable" data-vehicle-id="${v.id}" tabindex="0" title="Open ${escapeHtml(v.name)}">
      <td><i class="fa-solid ${v.icon}" style="margin-right:8px;color:var(--blue)"></i>${escapeHtml(v.name)}</td>
      <td>${serviceChips(v)}</td>
      <td>${vehicleAllows(v, 'ride')
        ? `<strong>${escapeHtml(passengerRangeText(v))}</strong><br><small style="color:var(--text-muted)">${escapeHtml(rideFareSummary(v))}</small>`
        : '—'}</td><td>${peso(v.base_fare)}</td><td>${peso(v.per_km_rate)}</td>
      <td>${v.is_available ? '<span class="badge badge--completed">Yes</span>' : '<span class="badge badge--cancelled">No</span>'}</td>
      <td><div class="row-actions">
        <button class="icon-btn" data-vehicle-id="${v.id}" aria-label="Edit ${escapeHtml(v.name)}"><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" onclick="event.stopPropagation(); deleteVehicle('${v.id}')" aria-label="Delete ${escapeHtml(v.name)}"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('');

  // populate visual chip grid above the table
  const chipGrid = document.getElementById('vehicle-chips');
  if (chipGrid) {
    chipGrid.innerHTML = ALL_VEHICLES.map(v => `
      <button type="button" class="vehicle-chip-item" data-vehicle-id="${v.id}" title="Open ${escapeHtml(v.name)}">
        <i class="fa-solid ${v.icon || 'fa-car'}"></i>
        <span>${escapeHtml(v.name)}</span>
        <small>${peso(v.base_fare)} base</small>
        <small class="vehicle-chip-item__services">${escapeHtml(vehicleServicesText(v))}</small>
      </button>`).join('');
  }
}

// Ride / Food / Parcel / Hauling labels for a vehicle (vehicles.services, sql/040).
const SERVICE_ICONS = { ride: 'fa-car-side', food: 'fa-utensils', parcel: 'fa-box', hauling: 'fa-truck-moving' };
function serviceChips(v) {
  return `<span class="svc-chips">${vehicleServices(v).map(s =>
    `<span class="svc-chip svc--${s}"><i class="fa-solid ${SERVICE_ICONS[s]}"></i>${SERVICE_LABELS[s]}</span>`).join('')}</span>`;
}

// Clicking a vehicle (table row, its pen button, or a tile above the table)
// opens it with its services.
function wireVehicleClicks() {
  const open = (e) => {
    const el = e.target.closest('[data-vehicle-id]');
    if (!el || e.target.closest('.danger')) return;
    const v = ALL_VEHICLES.find(x => x.id === el.dataset.vehicleId);
    if (v) openVehicleModal(v);
  };
  document.getElementById('vehicle-chips')?.addEventListener('click', open);
  const table = document.getElementById('vehicles-table');
  table?.addEventListener('click', open);
  table?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('tr[data-vehicle-id]')) open(e); });
}
function openVehicleModal(v) {
  document.getElementById('vehicle-modal-title').textContent = v ? `${v.name} — ${vehicleServicesText(v)}` : 'Add vehicle category';
  document.getElementById('vehicle-id').value = v?.id || '';
  document.getElementById('vehicle-name').value = v?.name || '';
  document.getElementById('vehicle-icon').value = v?.icon || 'fa-car';
  document.getElementById('vehicle-capacity').value = v?.capacity || 1;
  document.getElementById('vehicle-available').value = String(v?.is_available ?? true);
  document.getElementById('vehicle-base').value = v?.base_fare || '';
  document.getElementById('vehicle-rate').value = v?.per_km_rate || '';
  const services = v ? vehicleServices(v) : ['ride', 'food', 'parcel'];
  document.querySelectorAll('#vehicle-services input').forEach(cb => { cb.checked = services.includes(cb.value); });
  const set = (id, val) => { document.getElementById(id).value = val ?? ''; };
  set('vehicle-min-pax', v?.min_passengers ?? 1);
  set('vehicle-max-pax', v?.max_passengers ?? v?.capacity ?? 1);
  set('vehicle-ride-base', v?.ride_base_fare ?? '');
  set('vehicle-ride-km', v?.ride_base_km ?? 0);
  set('vehicle-ride-rate', v?.ride_per_km_rate ?? '');
  set('vehicle-extra-pax', v?.extra_passenger_fee ?? 0);
  document.getElementById('vehicle-per-person').checked = !!v?.fare_per_passenger;
  syncVehicleRideBox();
  document.getElementById('vehicle-modal').classList.add('open');
}
function closeVehicleModal() { document.getElementById('vehicle-modal').classList.remove('open'); }
// The ride settings only matter when Ride is switched on for the vehicle.
function syncVehicleRideBox() {
  const ride = document.querySelector('#vehicle-services input[value="ride"]')?.checked;
  const box = document.getElementById('vehicle-ride');
  if (box) box.hidden = !ride;
}
document.addEventListener('change', (e) => { if (e.target.closest?.('#vehicle-services')) syncVehicleRideBox(); });
function wireVehicleForm() {
  document.getElementById('vehicle-save').addEventListener('click', async () => {
    const id = document.getElementById('vehicle-id').value;
    const payload = {
      name: document.getElementById('vehicle-name').value.trim(),
      icon: document.getElementById('vehicle-icon').value.trim() || 'fa-car',
      capacity: Number(document.getElementById('vehicle-capacity').value),
      is_available: document.getElementById('vehicle-available').value === 'true',
      base_fare: Number(document.getElementById('vehicle-base').value),
      per_km_rate: Number(document.getElementById('vehicle-rate').value),
      services: [...document.querySelectorAll('#vehicle-services input:checked')].map(cb => cb.value),
    };
    if (!requireFields({ 'Name': payload.name, 'Base fare': payload.base_fare, 'Per-km rate': payload.per_km_rate })) return;
    if (!payload.services.length) { toast('Switch on at least one service for this vehicle.', 'error'); return; }
    // Ride passengers + fare (sql/044); blank ride fares fall back to the base fare / per-km.
    const num = (id) => { const s = document.getElementById(id).value.trim(); return s === '' ? null : Number(s); };
    Object.assign(payload, {
      min_passengers: num('vehicle-min-pax') ?? 1,
      max_passengers: num('vehicle-max-pax') ?? (payload.capacity || 1),
      ride_base_fare: num('vehicle-ride-base'),
      ride_base_km: num('vehicle-ride-km') ?? 0,
      ride_per_km_rate: num('vehicle-ride-rate'),
      extra_passenger_fee: num('vehicle-extra-pax') ?? 0,
      fare_per_passenger: document.getElementById('vehicle-per-person').checked,
    });
    if (payload.min_passengers < 1 || payload.max_passengers < payload.min_passengers || payload.max_passengers > 60) {
      toast('Passengers: min must be at least 1 and no more than max (up to 60).', 'error'); return;
    }
    if (payload.ride_base_km < 0 || payload.ride_base_km > 50) { toast('km included must be between 0 and 50.', 'error'); return; }

    const { error } = id ? await supabase.from('vehicles').update(payload).eq('id', id) : await supabase.from('vehicles').insert(payload);
    if (error) { toast(error.message, 'error'); return; }
    toast(id ? 'Vehicle updated.' : 'Vehicle added.', 'success');
    closeVehicleModal();
    loadVehicles();
  });
}
async function deleteVehicle(id) {
  if (!(await appConfirm('Existing bookings keep their history.', { title: 'Delete this vehicle category?', confirmText: 'Delete', danger: true, icon: 'fa-trash-can' }))) return;
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Vehicle deleted.', 'success');
  loadVehicles();
}

// ---- restaurants -----------------------------------------------------------
let ALL_RESTAURANTS = [];

async function loadRestaurants() {
  showSkeleton(document.querySelector('#restaurants-table tbody'), skeletonRows(5, 5));
  const { data, error } = await supabase.from('restaurants').select('*').order('name');
  if (error) { console.error('loadRestaurants error:', error); toast(error.message, 'error'); }
  ALL_RESTAURANTS = data || [];
  const tbody = document.querySelector('#restaurants-table tbody');
  if (ALL_RESTAURANTS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState({
      icon: 'fa-store',
      title: 'No restaurants yet',
      body: 'Add one so customers have somewhere to order food from.'
    })}</td></tr>`;
    return;
  }
  tbody.innerHTML = ALL_RESTAURANTS.map(r => `
    <tr>
      <td>${escapeHtml(r.name)}</td>
      <td>${escapeHtml(r.address)}</td>
      <td>${escapeHtml(r.cuisine_type || '—')}</td>
      <td>${r.is_active ? '<span class="badge badge--completed">Yes</span>' : '<span class="badge badge--cancelled">No</span>'}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="Menu" onclick="openMenuModal('${r.id}')"><i class="fa-solid fa-utensils"></i></button>
        <button class="icon-btn" title="Edit" onclick='openRestaurantModal(${JSON.stringify(r)})'><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" title="Delete" onclick="deleteRestaurant('${r.id}')"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}
// ---- catalog images (restaurant logos, menu-item photos) -------------------
// Uploaded to the public catalog-images bucket (sql/027; admins only). Big
// photos are scaled down to 1000px first so menus stay quick to load.
async function _shrinkImage(file, maxSide = 1000) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    // PNG keeps a logo's transparent background; photos go to JPEG.
    const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const blob = await new Promise((res) => canvas.toBlob(res, type, 0.85));
    return blob ? { blob, type } : { blob: file, type: file.type };
  } catch (_) {
    return { blob: file, type: file.type };
  }
}
async function uploadCatalogImage(file, folder, id) {
  if (!file) return null;
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { toast('Use a JPG, PNG or WebP image.', 'error'); return null; }
  if (file.size > 15 * 1024 * 1024) { toast('That image is too large (max 15 MB).', 'error'); return null; }
  const { blob, type } = await _shrinkImage(file);
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${folder}/${id || 'new'}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('catalog-images').upload(path, blob, { contentType: type, upsert: false });
  if (error) { toast(`Upload failed: ${error.message}`, 'error'); return null; }
  return supabase.storage.from('catalog-images').getPublicUrl(path).data.publicUrl;
}
function _setRestaurantPreview(url) {
  const box = document.getElementById('restaurant-image-preview');
  if (!box) return;
  box.innerHTML = safeImageUrl(url)
    ? `<img src="${escapeHtml(url)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'), { className: 'fa-solid fa-image' }))">`
    : '<i class="fa-solid fa-image"></i>';
}
function wireCatalogUploads() {
  const rFile = document.getElementById('restaurant-image-file');
  rFile?.addEventListener('change', async () => {
    const file = rFile.files[0];
    rFile.value = '';
    const btn = document.getElementById('restaurant-image-upload');
    setLoading(btn, true);
    const url = await uploadCatalogImage(file, 'restaurants', document.getElementById('restaurant-id').value);
    setLoading(btn, false);
    if (!url) return;
    document.getElementById('restaurant-image').value = url;
    _setRestaurantPreview(url);
    toast('Logo uploaded — press Save restaurant to keep it.', 'success');
  });
  document.getElementById('restaurant-image')?.addEventListener('input', (e) => _setRestaurantPreview(e.target.value.trim()));

  const mFile = document.getElementById('menu-photo-file');
  mFile?.addEventListener('change', async () => {
    const file = mFile.files[0];
    const itemId = mFile.dataset.itemId;
    mFile.value = '';
    if (!file || !itemId) return;
    toast('Uploading photo…', 'info');
    const url = await uploadCatalogImage(file, 'menu-items', itemId);
    if (!url) return;
    const { error } = await supabase.from('menu_items').update({ image_url: url }).eq('id', itemId);
    if (error) { toast(error.message, 'error'); return; }
    toast('Photo saved.', 'success');
    await loadMenuItems(ACTIVE_MENU_RESTAURANT_ID);
  });
}
function pickMenuItemPhoto(itemId) {
  const input = document.getElementById('menu-photo-file');
  input.dataset.itemId = itemId;
  input.click();
}
async function removeMenuItemPhoto(itemId) {
  if (!(await appConfirm('The item will show without a photo.', { title: 'Remove this photo?', confirmText: 'Remove', danger: true, icon: 'fa-image' }))) return;
  const { error } = await supabase.from('menu_items').update({ image_url: null }).eq('id', itemId);
  if (error) { toast(error.message, 'error'); return; }
  await loadMenuItems(ACTIVE_MENU_RESTAURANT_ID);
}

function openRestaurantModal(r) {
  document.getElementById('restaurant-modal-title').textContent = r ? 'Edit restaurant' : 'Add restaurant';
  document.getElementById('restaurant-id').value = r?.id || '';
  document.getElementById('restaurant-name').value = r?.name || '';
  document.getElementById('restaurant-address').value = r?.address || '';
  document.getElementById('restaurant-cuisine').value = r?.cuisine_type || '';
  document.getElementById('restaurant-available').value = String(r?.is_active ?? true);
  document.getElementById('restaurant-image').value = r?.image_url || '';
  _setRestaurantPreview(r?.image_url || '');
  document.getElementById('restaurant-modal').classList.add('open');
}
function closeRestaurantModal() { document.getElementById('restaurant-modal').classList.remove('open'); }
function wireRestaurantForm() {
  document.getElementById('restaurant-save').addEventListener('click', async () => {
    const id = document.getElementById('restaurant-id').value;
    const payload = {
      name: document.getElementById('restaurant-name').value.trim(),
      address: document.getElementById('restaurant-address').value.trim(),
      cuisine_type: document.getElementById('restaurant-cuisine').value.trim() || null,
      is_active: document.getElementById('restaurant-available').value === 'true',
      image_url: document.getElementById('restaurant-image').value.trim() || null,
    };
    if (!requireFields({ Name: payload.name, Address: payload.address })) return;
    if (!id) payload.created_by = CURRENT_PROFILE.id;

    const { error } = id
      ? await supabase.from('restaurants').update(payload).eq('id', id)
      : await supabase.from('restaurants').insert(payload);
    if (error) { toast(error.message, 'error'); return; }
    toast(id ? 'Restaurant updated.' : 'Restaurant added.', 'success');
    closeRestaurantModal();
    loadRestaurants();
  });
}
async function deleteRestaurant(id) {
  if (!(await appConfirm('Its whole menu is deleted too. Existing orders keep their history.', { title: 'Delete this restaurant?', confirmText: 'Delete', danger: true, icon: 'fa-trash-can' }))) return;
  const { error } = await supabase.from('restaurants').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Restaurant deleted.', 'success');
  loadRestaurants();
}

// ---- menu items --------------------------------------------------------
let ACTIVE_MENU_RESTAURANT_ID = null;

async function openMenuModal(restaurantId) {
  ACTIVE_MENU_RESTAURANT_ID = restaurantId;
  const restaurant = ALL_RESTAURANTS.find(r => r.id === restaurantId);
  document.getElementById('menu-modal-title').textContent = restaurant ? `Menu — ${restaurant.name}` : 'Menu';
  document.getElementById('menu-item-form').reset();
  document.getElementById('menu-item-id').value = '';
  document.getElementById('menu-modal').classList.add('open');
  await loadMenuItems(restaurantId);
}
function closeMenuModal() {
  document.getElementById('menu-modal').classList.remove('open');
  ACTIVE_MENU_RESTAURANT_ID = null;
}
async function loadMenuItems(restaurantId) {
  const tbody = document.querySelector('#menu-items-table tbody');
  showSkeleton(tbody, skeletonRows(3, 4));
  const { data, error } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('name');
  if (error) { console.error('loadMenuItems error:', error); toast(error.message, 'error'); return; }
  if (!data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState({ icon: 'fa-utensils', title: 'No items yet', body: 'Add this restaurant\'s menu above.' })}</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(m => `
    <tr>
      <td>
        <div class="menu-photo-cell">
          <button type="button" class="menu-photo" title="Upload a photo" onclick="pickMenuItemPhoto('${m.id}')">
            ${safeImageUrl(m.image_url) ? `<img src="${escapeHtml(m.image_url)}" alt="" loading="lazy">` : '<i class="fa-solid fa-camera"></i>'}
            ${isSamplePhoto(m.image_url) ? '<span class="sample-tag sample-tag--xs">Sample</span>' : ''}
          </button>
          ${m.image_url ? `<button type="button" class="menu-photo-remove" title="Remove photo" onclick="removeMenuItemPhoto('${m.id}')"><i class="fa-solid fa-xmark"></i></button>` : ''}
        </div>
      </td>
      <td>${escapeHtml(m.name)}</td>
      <td>${peso(m.price)}</td>
      <td><button class="icon-btn" title="${m.is_available ? 'Mark unavailable' : 'Mark available'}" onclick="toggleMenuItemAvailable('${m.id}', ${m.is_available})">
        <i class="fa-solid ${m.is_available ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
      </button></td>
      <td><button class="icon-btn danger" title="Delete" onclick="deleteMenuItem('${m.id}')"><i class="fa-solid fa-trash"></i></button></td>
    </tr>`).join('');
}
function wireMenuItemForm() {
  const form = document.getElementById('menu-item-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!ACTIVE_MENU_RESTAURANT_ID) return;
    const btn = document.getElementById('menu-item-save');
    const name = document.getElementById('menu-item-name').value.trim();
    const price = parseFloat(document.getElementById('menu-item-price').value);
    if (!requireFields({ 'Item name': name, Price: price })) return;
    setLoading(btn, true);
    const { error } = await supabase.from('menu_items').insert({
      restaurant_id: ACTIVE_MENU_RESTAURANT_ID, name, price,
    });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Item added.', 'success');
    form.reset();
    await loadMenuItems(ACTIVE_MENU_RESTAURANT_ID);
  });
}
async function toggleMenuItemAvailable(id, currentlyAvailable) {
  const { error } = await supabase.from('menu_items').update({ is_available: !currentlyAvailable }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  await loadMenuItems(ACTIVE_MENU_RESTAURANT_ID);
}
async function deleteMenuItem(id) {
  if (!(await appConfirm('Customers will no longer see it on the menu.', { title: 'Delete this menu item?', confirmText: 'Delete', danger: true, icon: 'fa-trash-can' }))) return;
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Item deleted.', 'success');
  await loadMenuItems(ACTIVE_MENU_RESTAURANT_ID);
}

// ---- bookings monitor -------------------------------------------------------
function wireBookingTabs() {
  document.querySelectorAll('.tab-btn[data-booking-kind]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-booking-kind]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      BOOKING_KIND = btn.dataset.bookingKind;
      viewState('booking-kind', BOOKING_KIND);
      BOOKINGS_PAGE = 1;
      loadBookings();
    });
  });
}
// The count on Bookings & deliveries (and each kind's tab): bookings still
// waiting for a rider.
async function loadWaitingBookingCounts() {
  const counts = await Promise.all(Object.keys(TABLE_BY_KIND).map(k =>
    supabase.from(TABLE_BY_KIND[k]).select('id', { count: 'exact', head: true })
      .eq('status', 'pending').is('rider_id', null).then(r => [k, r.count || 0])));
  counts.forEach(([k, n]) => setNavCount('bookings-' + k, n));
  setNavCount('bookings', counts.reduce((s, [, n]) => s + n, 0));
}

async function loadBookings() {
  loadWaitingBookingCounts();
  const table = TABLE_BY_KIND[BOOKING_KIND];
  const tbody = document.querySelector('#bookings-table tbody');
  showSkeleton(tbody, skeletonRows(5, 6), BOOKING_KIND);
  // No .limit() here — capping this at a fixed number silently hides every
  // older booking once a rider/customer passes that count. Fetch everything
  // for this kind and paginate client-side instead so nothing goes missing.
  const { data, error } = await supabase.from(table).select('*, customer:customer_id(full_name), rider:rider_id(full_name)').order('created_at', { ascending: false });
  const pager = document.getElementById('bookings-pagination');
  if (error || !data || data.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">${error
      ? emptyState({
          icon: 'fa-triangle-exclamation',
          title: 'Could not load bookings',
          body: error.message,
          tone: 'error'
        })
      : emptyState({
          icon: 'fa-route',
          title: 'No bookings yet',
          body: 'Bookings of this type will be listed here once customers start booking.'
        })}</td></tr>`;
    if (pager) pager.innerHTML = '';
    return;
  }
  const { slice, totalPages } = paginate(data, BOOKINGS_PAGE, ADMIN_PAGE_SIZE);
  tbody.innerHTML = slice.map(b => {
    const title = BOOKING_KIND === 'food' ? b.restaurant_name
      : BOOKING_KIND === 'parcel' ? `${b.sender_name} → ${b.receiver_name}`
      : bookingTitle(b, BOOKING_KIND);
    return `<tr>
      <td>${escapeHtml(title)}${BOOKING_KIND === 'transport' ? '<br>' + passengersChip(b, 'transport') : ''}</td>
      <td>${escapeHtml(b.customer?.full_name || '—')}</td>
      <td>${escapeHtml(b.rider?.full_name || 'Unassigned')}</td>
      <td>${peso(b.final_fare ?? b.estimated_fare)}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${formatDate(b.created_at)}</td>
    </tr>`;
  }).join('');
  if (pager) {
    pager.innerHTML = totalPages <= 1 ? '' : `
      <button ${BOOKINGS_PAGE === 1 ? 'disabled' : ''} onclick="changeBookingsPage(-1)"><i class="fa-solid fa-chevron-left"></i></button>
      <span>Page ${BOOKINGS_PAGE} of ${totalPages}</span>
      <button ${BOOKINGS_PAGE === totalPages ? 'disabled' : ''} onclick="changeBookingsPage(1)"><i class="fa-solid fa-chevron-right"></i></button>`;
  }
}
function changeBookingsPage(delta) { BOOKINGS_PAGE += delta; loadBookings(); }

// ---- payments -------------------------------------------------------------
async function loadPayments() {
  showSkeleton(document.querySelector('#payments-table tbody'), skeletonRows(5, 7));
  // No .limit() — the stat cards below must reflect EVERY recorded
  // transaction, not just the most recent 50, otherwise total revenue /
  // commission / rider payouts silently undercount once volume grows.
  const { data } = await supabase.from('payments').select('*, customer:customer_id(full_name), rider:rider_id(full_name)').order('created_at', { ascending: false });
  ALL_PAYMENTS = data || [];
  PAY_TOTALS.processed = ALL_PAYMENTS.reduce((a, r) => a + Number(r.amount), 0);
  PAY_TOTALS.commission = ALL_PAYMENTS.reduce((a, r) => a + Number(r.platform_commission), 0);
  PAY_TOTALS.riderShare = ALL_PAYMENTS.reduce((a, r) => a + Number(r.rider_payout), 0);
  PAY_TOTALS.count = ALL_PAYMENTS.length;
  renderPaymentStats();
  renderPaymentsPage();
}

// The four cards at the top of Payments: money through iTULOD, its cut, and
// what's still open with riders (filled in by loadRiderBalances).
const PAY_TOTALS = { processed: 0, commission: 0, riderShare: 0, count: 0, collect: 0, collectRiders: 0, pay: 0, payRiders: 0 };
function renderPaymentStats() {
  const t = PAY_TOTALS;
  const riders = (n) => `${n} rider${n === 1 ? '' : 's'}`;
  document.getElementById('payment-stats').innerHTML = [
    ['Total processed', peso(t.processed), `${t.count} paid booking${t.count === 1 ? '' : 's'} · ${peso(t.riderShare)} to riders`, 'fa-money-bill-wave', 'icon--blue'],
    ['iTULOD commission', peso(t.commission), 'Its cut of every paid booking', 'fa-percent', 'icon--orange'],
    ['To collect from riders', peso(t.collect), t.collectRiders ? `${riders(t.collectRiders)} owe commission` : 'Nobody owes iTULOD', 'fa-arrow-down', 'icon--red'],
    ['To pay riders', peso(t.pay), t.payRiders ? `${riders(t.payRiders)} to send their share` : 'Nobody is waiting', 'fa-arrow-up', 'icon--green'],
  ].map(([label, value, sub, icon, tone]) => `
    <div class="stat-card"><div class="top"><div class="icon ${tone}"><i class="fa-solid ${icon}"></i></div></div>
      <strong>${value}</strong><span class="label">${label}</span><span class="stat-sub">${escapeHtml(sub)}</span></div>`).join('');
}

let PAYMENTS_METHOD = 'all';
function wirePaymentFilters() {
  document.querySelectorAll('#payments-filter .seg-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#payments-filter .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    PAYMENTS_METHOD = b.dataset.method; PAYMENTS_PAGE = 1; renderPaymentsPage();
  }));
  document.querySelectorAll('#balances-filter .seg-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#balances-filter .seg-btn').forEach(x => x.classList.toggle('active', x === b));
    BALANCES_SHOW = b.dataset.show; renderRiderBalances();
  }));
}

const PAY_METHOD_LABEL = { cash: 'Cash', gcash: 'GCash', wallet: 'Wallet', card: 'Card' };
const PAY_KIND_ICON = { transport: 'fa-car', food: 'fa-utensils', parcel: 'fa-box', hauling: 'fa-truck-moving' };
function renderPaymentsPage() {
  const tbody = document.querySelector('#payments-table tbody');
  const pager = document.getElementById('payments-pagination');
  const list = PAYMENTS_METHOD === 'all' ? ALL_PAYMENTS : ALL_PAYMENTS.filter(p => p.method === PAYMENTS_METHOD);
  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">${emptyState({
      icon: 'fa-sack-dollar',
      title: ALL_PAYMENTS.length ? `No ${PAY_METHOD_LABEL[PAYMENTS_METHOD]} transactions` : 'No transactions yet',
      body: 'Payments appear here as bookings are completed and paid.'
    })}</td></tr>`;
    if (pager) pager.innerHTML = '';
    return;
  }
  const { slice, totalPages } = paginate(list, PAYMENTS_PAGE, ADMIN_PAGE_SIZE);
  tbody.innerHTML = slice.map(p => `
    <tr>
      <td class="pay-card-head"><span class="pay-kind"><i class="fa-solid ${PAY_KIND_ICON[p.booking_type] || 'fa-receipt'}"></i> ${escapeHtml(KIND_LABEL[p.booking_type] || p.booking_type)}</span></td>
      <td data-label="Customer → Rider"><span class="pay-who">${escapeHtml(p.customer?.full_name || '—')}<small>→ ${escapeHtml(p.rider?.full_name || '—')}</small></span></td>
      <td class="num" data-label="Amount"><strong>${peso(p.amount)}</strong></td>
      <td class="num" data-label="Commission">${peso(p.platform_commission)}</td>
      <td class="num" data-label="Rider share">${peso(p.rider_payout)}</td>
      <td data-label="Method">${escapeHtml(PAY_METHOD_LABEL[p.method] || p.method)}</td>
      <td data-label="Status">${statusBadge(p.status)}</td>
      <td class="nowrap" data-label="Date">${formatDate(p.created_at)}</td>
    </tr>`).join('');
  if (pager) {
    pager.innerHTML = totalPages <= 1 ? '' : `
      <button ${PAYMENTS_PAGE === 1 ? 'disabled' : ''} onclick="changePaymentsPage(-1)"><i class="fa-solid fa-chevron-left"></i></button>
      <span>Page ${PAYMENTS_PAGE} of ${totalPages}</span>
      <button ${PAYMENTS_PAGE === totalPages ? 'disabled' : ''} onclick="changePaymentsPage(1)"><i class="fa-solid fa-chevron-right"></i></button>`;
  }
}
function changePaymentsPage(delta) { PAYMENTS_PAGE += delta; renderPaymentsPage(); }

// ---- announcements ----------------------------------------------------------
function wireAnnouncementForm() {
  document.getElementById('announcement-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('ann-submit');
    const title = document.getElementById('ann-title').value.trim();
    const body = document.getElementById('ann-body').value.trim();
    const audience = document.getElementById('ann-audience').value;
    if (!requireFields({ Title: title, Message: body })) return;

    setLoading(btn, true);
    // The database delivers it as a notification (+ phone push) to the
    // audience and records how many it reached (sql/048).
    const { data: ann, error } = await supabase.from('announcements')
      .insert({ title, body, audience, created_by: CURRENT_PROFILE.id }).select('recipients').single();
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast(`Announcement sent to ${ann?.recipients ?? 0} ${audience === 'all' ? 'customers and riders' : audience + 's'}.`, 'success');
    e.target.reset();
    loadAnnouncements();
  });
}
async function loadAnnouncements() {
  const el = document.getElementById('announcement-list');
  showSkeleton(el, skeletonList(2));
  const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
  if (!data || data.length === 0) {
    el.innerHTML = emptyState({
      icon: 'fa-bullhorn',
      title: 'Nothing published yet',
      body: 'Announcements you publish will be listed here.'
    });
    return;
  }
  const AUDIENCE = { all: 'Everyone', customer: 'Customers', rider: 'Riders' };
  el.innerHTML = data.map(a => `
    <div class="notif-item">
      <span class="dot" style="background:var(--orange)"></span>
      <div style="flex:1"><h4>${escapeHtml(a.title)}</h4><p>${escapeHtml(a.body)}</p>
        <time>${formatDate(a.created_at)} · ${AUDIENCE[a.audience] || a.audience} · ${a.recipients == null
          ? '<strong style="color:var(--red)">not sent</strong>'
          : `sent to ${a.recipients} ${a.recipients === 1 ? 'person' : 'people'}`}</time></div>
      ${a.recipients == null ? `<button type="button" class="btn btn-primary btn-sm" onclick="sendAnnouncement('${a.id}', this)"><i class="fa-solid fa-paper-plane"></i> Send now</button>` : ''}
    </div>`).join('');
}
// Announcements published before delivery existed were never sent (sql/048).
async function sendAnnouncement(id, btn) {
  setLoading(btn, true);
  const { data, error } = await supabase.rpc('deliver_announcement', { p_id: id });
  setLoading(btn, false);
  if (error) { toast(error.message, 'error'); return; }
  toast(`Sent to ${data} ${data === 1 ? 'person' : 'people'}.`, 'success');
  loadAnnouncements();
}

// ---- realtime ------------------------------------------------------------
let realtimeTimer = null;
let _photoReviewTimer = null;
function debouncedReload(fns, delay = 1500) {
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(() => fns.forEach(f => f()), delay);
}
function subscribeRealtime() {
  supabase.channel('admin-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_applications' }, () => debouncedReload([loadPendingApplications, loadAllRiders, loadAnalytics]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_bookings' }, () => debouncedReload([loadBookings, loadAnalytics, loadPayments, loadRiderBalances]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'food_deliveries' }, () => debouncedReload([loadBookings, loadAnalytics, loadPayments, loadRiderBalances]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parcel_deliveries' }, () => debouncedReload([loadBookings, loadAnalytics, loadPayments, loadRiderBalances]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'hauling_bookings' }, () => debouncedReload([loadBookings, loadAnalytics, loadPayments, loadRiderBalances]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => debouncedReload([loadPayments]))
    // riders paying by GCash / "I paid the admin" (sql/051)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_payment_claims' }, () => loadRiderClaims())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_settlements' }, () => loadRiderBalances())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_requests' }, () => debouncedReload([loadSupportRequests]))
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
      // Only photo-review changes matter here; own timer so it doesn't cancel
      // the shared debounced reload above.
      const p = payload.new || {};
      if (!p.avatar_pending_url && !PHOTO_REVIEW_IDS.has(p.id)) return;
      clearTimeout(_photoReviewTimer);
      _photoReviewTimer = setTimeout(loadPhotoReviews, 1500);
    })
    .subscribe();
}

// ---- support requests --------------------------------------------------
let SUPPORT_TAB = 'open';
let ACTIVE_SUPPORT = null;
let ALL_SUPPORT = [];

function wireSupportSubTabs() {
  document.querySelectorAll('.tab-btn[data-support-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-support-tab]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      SUPPORT_TAB = btn.dataset.supportTab;
      viewState('support-tab', SUPPORT_TAB);
      renderSupportList();
    });
  });
}

async function loadSupportRequests() {
  const { data, error } = await supabase
    .from('support_requests')
    .select('*, customer:customer_id(full_name, email)')
    .order('created_at', { ascending: false });
  if (error) { console.error('loadSupportRequests error:', error); return; }
  ALL_SUPPORT = data || [];
  const openCount = ALL_SUPPORT.filter(r => r.status !== 'resolved').length;
  const badge = document.getElementById('support-open-badge');
  if (badge) {
    badge.textContent = openCount;
    badge.style.display = openCount > 0 ? 'inline-flex' : 'none';
  }
  renderSupportList();
}

function renderSupportList() {
  const el = document.getElementById('support-list');
  if (!el) return;
  const rows = SUPPORT_TAB === 'open' ? ALL_SUPPORT.filter(r => r.status !== 'resolved') : ALL_SUPPORT;
  if (rows.length === 0) {
    el.innerHTML = `<div class="card">${emptyState({
      icon: 'fa-life-ring',
      title: SUPPORT_TAB === 'open' ? 'All clear!' : 'Nothing here yet',
      body: SUPPORT_TAB === 'open' ? 'No open support requests right now.' : 'Customer refund/dispute requests will show up here.',
      tone: SUPPORT_TAB === 'open' ? 'success' : undefined,
    })}</div>`;
    return;
  }
  el.innerHTML = rows.map(r => `
    <div class="booking-card" style="cursor:pointer" onclick='openSupportModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
      <div class="kind-icon" style="background:var(--orange)"><i class="fa-solid fa-life-ring"></i></div>
      <div class="info"><div>
        <h4>${escapeHtml(r.subject)}</h4>
        <p>${escapeHtml(r.customer?.full_name || 'Unknown')} · ${escapeHtml(r.category)} · ${formatDate(r.created_at)}</p>
      </div></div>
      <div class="meta">${statusBadge(r.status)}</div>
    </div>`).join('');
}

function openSupportModal(req) {
  ACTIVE_SUPPORT = req;
  document.getElementById('support-modal-body').innerHTML = `
    <div style="margin-bottom:14px">
      <strong>${escapeHtml(req.customer?.full_name || 'Unknown')}</strong>
      <div style="color:var(--text-muted);font-size:var(--fs-sm)">${escapeHtml(req.customer?.email || '')}</div>
    </div>
    <div style="margin-bottom:14px"><span class="badge badge--pending">${escapeHtml(req.category)}</span> ${statusBadge(req.status)}</div>
    <div style="margin-bottom:14px">
      <div style="font-size:var(--fs-xs);color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Message</div>
      <p>${escapeHtml(req.message)}</p>
    </div>
    ${req.booking_id ? `<div style="margin-bottom:14px;font-size:var(--fs-sm);color:var(--text-muted)">Booking: ${escapeHtml(req.booking_type || '')} · ${escapeHtml(req.booking_id)}</div>` : ''}
    ${req.admin_response ? `<div style="margin-bottom:14px"><div style="font-size:var(--fs-xs);color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Your previous reply</div><p>${escapeHtml(req.admin_response)}</p></div>` : ''}
    ${req.booking_id || req.category === 'refund' ? `
      <div class="field">
        <label>Refund to customer's iTULOD wallet (optional)</label>
        <div style="display:flex;gap:8px">
          <input type="number" step="0.01" min="0" id="support-refund-amount" placeholder="₱ amount" style="flex:1">
          <button type="button" class="btn btn-outline btn-sm" onclick="refundFromSupport()"><i class="fa-solid fa-rotate-left"></i> Refund</button>
        </div>
      </div>` : ''}
    ${req.status !== 'resolved' ? `
      <div class="field" style="margin-bottom:0">
        <label>Reply to customer</label>
        <textarea id="support-reply" rows="4" placeholder="Explain what you're doing about this…"></textarea>
      </div>` : ''}
  `;
  document.getElementById('support-resolve-btn').style.display = req.status === 'resolved' ? 'none' : '';
  document.getElementById('support-modal').classList.add('open');
}
async function refundFromSupport() {
  if (!ACTIVE_SUPPORT) return;
  const amount = parseFloat(document.getElementById('support-refund-amount')?.value);
  if (!(amount > 0)) { toast('Enter the refund amount.', 'error'); return; }
  if (!(await appConfirm(`${peso(amount)} will be added to ${ACTIVE_SUPPORT.customer?.full_name || 'this customer'}'s iTULOD wallet.`, { title: 'Issue this refund?', confirmText: 'Refund', icon: 'fa-wallet' }))) return;
  const { error } = await supabase.rpc('admin_refund_to_wallet', {
    p_customer: ACTIVE_SUPPORT.customer_id,
    p_amount: amount,
    p_note: `Refund for support request: ${ACTIVE_SUPPORT.subject || ''}`.trim(),
    p_booking_type: ACTIVE_SUPPORT.booking_type || null,
    p_booking_id: ACTIVE_SUPPORT.booking_id || null,
  });
  if (error) { toast(error.message, 'error'); return; }
  toast(`${peso(amount)} refunded to the customer's wallet.`, 'success');
  document.getElementById('support-refund-amount').value = '';
}
function closeSupportModal() { document.getElementById('support-modal').classList.remove('open'); }

async function resolveSupportRequest() {
  if (!ACTIVE_SUPPORT) return;
  const reply = document.getElementById('support-reply')?.value.trim();
  if (!requireFields({ Reply: reply })) return;
  const btn = document.getElementById('support-resolve-btn');
  setLoading(btn, true);
  const { error } = await supabase.from('support_requests').update({
    status: 'resolved', admin_response: reply,
  }).eq('id', ACTIVE_SUPPORT.id);
  setLoading(btn, false);
  if (error) { toast(error.message, 'error'); return; }
  await supabase.from('notifications').insert({
    user_id: ACTIVE_SUPPORT.customer_id,
    title: 'Your support request was resolved',
    message: reply,
  });
  toast('Reply sent and marked resolved.', 'success');
  closeSupportModal();
  await loadSupportRequests();
}


// ---- rider balances & settlement (sql/024) --------------------------------
// Riders keep cash fares and owe iTULOD the commission; iTULOD holds GCash /
// wallet fares and owes the rider their payout. Positive net = iTULOD pays
// the rider; negative = collect from the rider. COD is owed to senders.
let ACTIVE_SETTLEMENT = null;

async function loadRiderBalances() {
  const tbody = document.querySelector('#rider-balances-table tbody');
  if (!tbody) return;
  showSkeleton(tbody, skeletonRows(4, 7));
  const [{ data, error }, { data: cfg }] = await Promise.all([
    supabase.rpc('admin_rider_balances'),
    supabase.from('platform_config').select('rider_debt_limit').single(),
  ]);
  if (error) { tbody.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`; return; }
  RIDER_DEBT_LIMIT = Number(cfg?.rider_debt_limit || 0);
  RIDER_BALANCES = data || [];
  const owe = RIDER_BALANCES.filter(r => Number(r.net) < 0), owed = RIDER_BALANCES.filter(r => Number(r.net) > 0);
  RIDERS_TO_PAY = owed.length;
  Object.assign(PAY_TOTALS, {
    collect: owe.reduce((a, r) => a - Number(r.net), 0), collectRiders: owe.length,
    pay: owed.reduce((a, r) => a + Number(r.net), 0), payRiders: owed.length,
  });
  updatePaymentsBadge();
  renderPaymentStats();
  renderRiderBalances();
}

// Open balances (default): riders with something to collect, pay or hand
// over. All riders: everyone who has had a paid trip.
let RIDER_BALANCES = [];
let RIDER_DEBT_LIMIT = 0;
let BALANCES_SHOW = 'open';
function renderRiderBalances() {
  const tbody = document.querySelector('#rider-balances-table tbody');
  const active = RIDER_BALANCES.filter(r => Number(r.online_earnings) > 0 || Number(r.cash_commission) > 0 || Number(r.net) !== 0 || Number(r.cod_unremitted) > 0);
  const rows = BALANCES_SHOW === 'open'
    ? active.filter(r => Math.abs(Number(r.net)) >= 0.005 || Number(r.cod_unremitted) > 0)
    : active;
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyState({ icon: 'fa-scale-balanced', title: 'All settled', body: BALANCES_SHOW === 'open' ? 'No rider owes iTULOD or is waiting to be paid.' : 'No rider has had a paid trip yet.', tone: 'success' })}</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => {
    const net = Math.round(Number(r.net) * 100) / 100;
    const netCell = net > 0
      ? `<span class="badge badge--pending">Pay rider ${peso(net)}</span>`
      : net < 0
        ? `<span class="badge badge--cancelled">Collect ${peso(-net)}</span>`
          + (RIDER_DEBT_LIMIT > 0 && -net > RIDER_DEBT_LIMIT ? `<span class="pay-flag" title="Owes more than the ${peso(RIDER_DEBT_LIMIT)} limit"><i class="fa-solid fa-ban"></i> Can't take jobs</span>` : '')
        : '<span class="badge badge--completed">Settled</span>';
    const paidIn = Number(r.collections_made), paidOut = Number(r.payouts_made);
    return `<tr>
      <td class="pay-card-head"><span class="pay-who"><strong>${escapeHtml(r.full_name || '—')}</strong><small>${escapeHtml(r.phone || '')}</small></span></td>
      <td class="num" data-label="Online earnings">${peso(r.online_earnings)}</td>
      <td class="num" data-label="Cash commission">${peso(r.cash_commission)}</td>
      <td class="num" data-label="Paid in / out"><span class="pay-who">${paidIn ? `In ${peso(paidIn)}` : '—'}<small>${paidOut ? `Out ${peso(paidOut)}` : ''}</small></span></td>
      <td data-label="Balance"><span class="pay-net">${netCell}</span></td>
      <td data-label="COD to hand over">${Number(r.cod_unremitted) > 0 ? `<span class="badge badge--pending">${peso(r.cod_unremitted)}</span>` : '<span class="muted">—</span>'}</td>
      <td class="act">${net !== 0
        ? `<button class="btn ${net > 0 ? 'btn-primary' : 'btn-outline'} btn-sm" onclick='openSettlementModal(${JSON.stringify({ id: r.rider_id, name: r.full_name, net })})'>${net > 0 ? '<i class="fa-solid fa-paper-plane"></i> Mark sent' : '<i class="fa-solid fa-check"></i> Mark paid'}</button>`
        : ''}</td>
    </tr>`;
  }).join('');
}

// ---- "I paid the admin" (sql/051) -------------------------------------------
// The badge on Payments: payments to confirm + riders iTULOD still has to pay.
let RIDERS_TO_PAY = 0;
let CLAIMS_TO_CONFIRM = 0;
function updatePaymentsBadge() { setNavCount('payments', RIDERS_TO_PAY + CLAIMS_TO_CONFIRM); }

async function loadRiderClaims() {
  const el = document.getElementById('rider-claims-list');
  if (!el) return;
  const { data, error } = await supabase.from('rider_payment_claims')
    .select('*, rider:rider_id(full_name, phone)').eq('status', 'pending').order('created_at');
  if (error) { el.innerHTML = emptyState({ icon: 'fa-triangle-exclamation', title: 'Could not load', body: error.message, tone: 'error' }); return; }
  CLAIMS_TO_CONFIRM = (data || []).length;
  updatePaymentsBadge();
  setNavCount('claims', CLAIMS_TO_CONFIRM);
  if (!CLAIMS_TO_CONFIRM) {
    el.innerHTML = `<p class="pay-empty"><i class="fa-solid fa-circle-check"></i> Nothing to confirm — when a rider taps "I paid the admin", it shows up here.</p>`;
    return;
  }
  el.innerHTML = data.map(c => `
    <div class="claim-row" data-claim="${c.id}">
      <div class="claim-row__icon"><i class="fa-solid fa-hand-holding-dollar"></i></div>
      <div class="claim-row__info">
        <strong>${escapeHtml(c.rider?.full_name || 'Rider')}</strong>
        <span>${c.method === 'gcash' ? "GCash sent to iTULOD's number" : 'Cash, handed to the admin'}${c.reference ? ' · ref. ' + escapeHtml(c.reference) : ''}</span>
        <small>${escapeHtml([c.rider?.phone, 'sent ' + formatDate(c.created_at)].filter(Boolean).join(' · '))}</small>
      </div>
      <div class="claim-row__amount">${peso(c.amount)}</div>
      <div class="claim-row__actions">
        <button class="btn btn-primary btn-sm" onclick="reviewClaim('${c.id}', true, this)"><i class="fa-solid fa-check"></i> Mark paid</button>
        <button class="btn btn-outline btn-sm" onclick="this.closest('.claim-row').classList.add('is-rejecting'); this.closest('.claim-row').querySelector('.claim-reason').focus()">Reject…</button>
      </div>
      <div class="claim-reject">
        <input type="text" class="claim-reason" maxlength="200" placeholder="Why can't you confirm it? The rider will see this.">
        <button class="btn btn-danger-ghost btn-sm" onclick="reviewClaim('${c.id}', false, this)">Reject</button>
        <button class="btn btn-outline btn-sm" onclick="this.closest('.claim-row').classList.remove('is-rejecting')">Cancel</button>
      </div>
    </div>`).join('');
}

async function reviewClaim(id, confirm, btn) {
  const reason = confirm ? null : btn.closest('.claim-row').querySelector('.claim-reason').value.trim();
  if (!confirm && !reason) { toast('Say why it wasn\'t confirmed.', 'error'); return; }
  setLoading(btn, true);
  const { error } = await supabase.rpc('admin_review_rider_claim', { p_claim: id, p_confirm: confirm, p_reason: reason });
  setLoading(btn, false);
  if (error) { toast(error.message, 'error'); return; }
  toast(confirm ? 'Marked paid — the rider\'s balance is updated.' : 'Rejected — the rider has been told why.', 'success');
  loadRiderClaims();
  loadRiderBalances();
}

function openSettlementModal(r) {
  ACTIVE_SETTLEMENT = r;
  const payout = r.net > 0;
  document.getElementById('settlement-modal-title').textContent = payout ? `Pay ${r.name}` : `Collect from ${r.name}`;
  document.getElementById('settlement-direction').value = payout ? 'payout' : 'collection';
  document.getElementById('settlement-amount').value = Math.abs(r.net).toFixed(2);
  document.getElementById('settlement-method').value = 'gcash';
  document.getElementById('settlement-reference').value = '';
  document.getElementById('settlement-note').value = '';
  document.getElementById('settlement-hint').textContent = payout
    ? 'Send this amount to the rider first (GCash / bank / cash), then record it here.'
    : 'Record the commission the rider paid you for their cash trips.';
  document.getElementById('settlement-modal').classList.add('open');
}
function closeSettlementModal() { document.getElementById('settlement-modal').classList.remove('open'); }

async function saveSettlement() {
  if (!ACTIVE_SETTLEMENT) return;
  const amount = parseFloat(document.getElementById('settlement-amount').value);
  if (!(amount > 0)) { toast('Enter an amount greater than zero.', 'error'); return; }
  const btn = document.getElementById('settlement-save');
  setLoading(btn, true);
  const { error } = await supabase.rpc('admin_record_settlement', {
    p_rider: ACTIVE_SETTLEMENT.id,
    p_direction: document.getElementById('settlement-direction').value,
    p_amount: amount,
    p_method: document.getElementById('settlement-method').value,
    p_reference: document.getElementById('settlement-reference').value.trim(),
    p_note: document.getElementById('settlement-note').value.trim(),
  });
  setLoading(btn, false);
  if (error) { toast(error.message, 'error'); return; }
  toast('Recorded — the rider has been notified.', 'success');
  closeSettlementModal();
  loadRiderBalances();
}

// ---- rider vehicle type (lets an admin move a rider onto hauling once
// they've checked the new vehicle's papers) --------------------------------
// Every rider vehicle type the job matching knows (sql/033 rider_type_for_vehicle),
// the same choices as sign-up (register.html).
const RIDER_VEHICLE_TYPES = ['Bicycle', 'Motorcycle', 'Tricycle', 'Car', 'SUV', 'Van', 'Jeepney', 'Bus', 'Pickup', 'Truck'];
const HAULING_VEHICLE_TYPES = ['Van', 'Pickup', 'Truck'];

async function changeRiderVehicle(riderId, vehicleType, selectEl) {
  if (!(await appConfirm("Make sure you've checked the vehicle's OR/CR.", { title: `Change vehicle to ${vehicleType}?`, confirmText: 'Change vehicle', icon: 'fa-car-side' }))) {
    loadAllRiders();
    return;
  }
  if (selectEl) selectEl.disabled = true;
  const { error } = await supabase.from('rider_applications')
    .update({ vehicle_type: vehicleType })
    .eq('rider_id', riderId).eq('status', 'approved');
  if (error) { toast(error.message, 'error'); loadAllRiders(); return; }
  await supabase.from('notifications').insert({
    user_id: riderId,
    title: 'Vehicle updated',
    message: HAULING_VEHICLE_TYPES.includes(vehicleType)
      ? `Your vehicle is now listed as ${vehicleType} — you'll receive hauling jobs too.`
      : `Your vehicle is now listed as ${vehicleType}.`,
  });
  toast('Vehicle updated.', 'success');
  loadAllRiders();
}

// ---- database backup (export only — see admin/dashboard.html for why
// restore isn't offered as an in-app action) --------------------------------
const BACKUP_TABLES = [
  'profiles', 'rider_applications', 'vehicles',
  'transport_bookings', 'food_deliveries', 'parcel_deliveries', 'hauling_bookings',
  'payments', 'reviews', 'notifications', 'announcements', 'platform_config',
  'saved_addresses', 'support_requests',
  'wallets', 'wallet_transactions', 'wallet_topups', 'referral_events',
  'booking_messages', 'push_subscriptions', 'rider_locations',
];

async function exportBackup() {
  const btn = document.getElementById('backup-export-btn');
  setLoading(btn, true);
  try {
    const results = await Promise.all(
      BACKUP_TABLES.map(t => supabase.from(t).select('*').then(r => ({ table: t, r })))
    );
    const failed = results.filter(({ r }) => r.error);
    if (failed.length) {
      console.error('Backup: failed tables', failed.map(f => `${f.table}: ${f.r.error.message}`));
    }
    const snapshot = {
      exported_at: new Date().toISOString(),
      exported_by: CURRENT_PROFILE?.id || null,
      tables: Object.fromEntries(results.map(({ table, r }) => [table, r.data || []])),
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `itulod-backup-${snapshot.exported_at.slice(0, 19).replace(/[:T]/g, '-')}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(failed.length
      ? `Backup downloaded, but ${failed.length} table(s) failed — check the console.`
      : 'Backup downloaded.', failed.length ? 'error' : 'success');
  } catch (err) {
    toast(err.message || 'Backup failed.', 'error');
  } finally {
    setLoading(btn, false);
  }
}
