/**
 * iTULOD — admin dashboard
 */
let CURRENT_PROFILE = null;
let ALL_CUSTOMERS = [];
let BOOKING_KIND = 'transport';
let ACTIVE_APPLICATION = null;
const TABLE_BY_KIND = { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries' };

(async function init() {
  CURRENT_PROFILE = await requireSession(['admin']);
  if (!CURRENT_PROFILE) return;

  document.getElementById('side-name').textContent = CURRENT_PROFILE.full_name;
  document.getElementById('side-avatar').textContent = initials(CURRENT_PROFILE.full_name);

  wireTabNav();
  wireRiderSubTabs();
  wireBookingTabs();
  wireCustomerSearch();
  wireVehicleForm();
  wireAnnouncementForm();

  await loadAnalytics();
  await loadCustomers();
  await loadPendingApplications();
  await loadAllRiders();
  await loadVehicles();
  await loadBookings();
  await loadPayments();
  await loadAnnouncements();
  subscribeRealtime();
})();

function initials(name) { return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }

// ---- tab nav ---------------------------------------------------------
function wireTabNav() {
  document.querySelectorAll('.side-link[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-link[data-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('#tab-analytics, #tab-customers, #tab-riders, #tab-vehicles, #tab-bookings, #tab-payments, #tab-announcements, #tab-settings').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      const titles = {
        analytics: ['Dashboard analytics', 'Platform overview at a glance.'],
        customers: ['Customers', 'All registered customers.'],
        riders: ['Riders & applications', 'Approve riders and manage the fleet.'],
        vehicles: ['Vehicle categories', 'Manage available vehicle types and fares.'],
        bookings: ['Bookings & deliveries', 'Monitor all activity across the platform.'],
        payments: ['Payments', 'Transactions, commissions, and payouts.'],
        announcements: ['Announcements', 'Broadcast messages to your users.'],
        settings: ['Settings', 'Platform configuration.']
      }[btn.dataset.tab];
      document.getElementById('page-title').textContent = titles[0];
      document.getElementById('page-sub').textContent = titles[1];
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

// ---- analytics ----------------------------------------------------------
async function loadAnalytics() {
  const [{ count: customerCount }, { count: riderCount }, { count: pendingApps }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'rider'),
    supabase.from('rider_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  ]);

  const allBookings = (await Promise.all(Object.values(TABLE_BY_KIND).map(t => supabase.from(t).select('status, final_fare, created_at'))))
    .flatMap(r => r.data || []);

  const completed = allBookings.filter(b => b.status === 'completed').length;
  const revenue = allBookings.reduce((a, b) => a + (b.status === 'completed' ? Number(b.final_fare || 0) : 0), 0);

  // Update the static stat card elements in the HTML
  const sc = document.getElementById('stat-customers'); if (sc) sc.textContent = customerCount ?? 0;
  const sr = document.getElementById('stat-riders');    if (sr) sr.textContent = riderCount ?? 0;
  const sb = document.getElementById('stat-bookings');  if (sb) sb.textContent = allBookings.length;
  const sv = document.getElementById('stat-revenue');   if (sv) sv.textContent = peso(revenue);

  // revenue chart, last 7 days
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (6 - i)); return d; });
  const totals = days.map(d => allBookings.filter(b => b.status === 'completed' && new Date(b.created_at).toDateString() === d.toDateString())
    .reduce((a, b) => a + Number(b.final_fare || 0), 0));
  const max = Math.max(1, ...totals);
  document.getElementById('revenue-chart').innerHTML = totals.map(t => `<div class="bar" style="height:${Math.max(4, (t/max)*100)}%"><span>${t > 0 ? peso(t) : ''}</span></div>`).join('');
  document.getElementById('revenue-labels').innerHTML = days.map(d => `<span>${d.toLocaleDateString('en-PH',{weekday:'short'})}</span>`).join('');

  // status breakdown — donut chart + legend
  const statuses = ['pending', 'completed', 'cancelled', 'ongoing', 'accepted'];
  const statusColors = { pending: '#facc15', completed: '#22c55e', cancelled: '#ef4444', ongoing: '#2563eb', accepted: '#94a3b8' };
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
  const { data, error } = await supabase.from('profiles').select('*').eq('role', 'customer').order('created_at', { ascending: false });
  ALL_CUSTOMERS = data || [];
  renderCustomers(ALL_CUSTOMERS);
  if (error) toast(error.message, 'error');
}
function renderCustomers(rows) {
  const tbody = document.querySelector('#customers-table tbody');
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-users"></i><p>No customers found.</p></div></td></tr>`; return; }
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
    });
  });
}
async function loadPendingApplications() {
  const { data } = await supabase.from('rider_applications').select('*, rider:rider_id(full_name,email,phone)').eq('status', 'pending').order('created_at', { ascending: false });
  const el = document.getElementById('pending-applications');
  if (!data || data.length === 0) { el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-check-double"></i><p>No pending applications.</p></div>`; return; }
  el.innerHTML = data.map(app => `
    <div class="booking-card">
      <div class="kind-icon" style="background:var(--blue)"><i class="fa-solid fa-id-card"></i></div>
      <div class="info"><div><h4>${escapeHtml(app.rider?.full_name || 'Unknown')}</h4><p>${escapeHtml(app.vehicle_type)} · ${escapeHtml(app.rider?.email || '')}</p></div></div>
      <div class="meta"><button class="btn btn-primary btn-sm" onclick='openAppModal(${JSON.stringify(app).replace(/'/g, "&#39;")})'>Review</button></div>
    </div>`).join('');
}
function openAppModal(app) {
  ACTIVE_APPLICATION = app;
  document.getElementById('app-modal-body').innerHTML = `
    <div style="display:flex;flex-direction:column;gap:12px;font-size:0.9rem">
      <div style="display:flex;justify-content:space-between"><span>Applicant</span><strong>${escapeHtml(app.rider?.full_name || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Email</span><strong>${escapeHtml(app.rider?.email || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Phone</span><strong>${escapeHtml(app.rider?.phone || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Vehicle type</span><strong>${escapeHtml(app.vehicle_type)}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>Plate number</span><strong>${escapeHtml(app.vehicle_plate || '—')}</strong></div>
      <div style="display:flex;justify-content:space-between"><span>License number</span><strong>${escapeHtml(app.license_number || '—')}</strong></div>
      <div>${app.license_url ? `<a href="${app.license_url}" target="_blank" class="btn btn-outline btn-sm">View license</a>` : ''} ${app.or_cr_url ? `<a href="${app.or_cr_url}" target="_blank" class="btn btn-outline btn-sm">View OR/CR</a>` : ''}</div>
    </div>`;
  document.getElementById('app-modal').classList.add('open');
}
function closeAppModal() { document.getElementById('app-modal').classList.remove('open'); }
async function decideApplication(status) {
  if (!ACTIVE_APPLICATION) return;
  const { error } = await supabase.from('rider_applications').update({ status, reviewed_by: CURRENT_PROFILE.id, reviewed_at: new Date().toISOString() }).eq('id', ACTIVE_APPLICATION.id);
  if (error) { toast(error.message, 'error'); return; }
  await supabase.from('notifications').insert({
    user_id: ACTIVE_APPLICATION.rider_id,
    title: status === 'approved' ? 'Application approved!' : 'Application update',
    message: status === 'approved' ? 'You can now accept booking requests.' : 'Your rider application was not approved. Contact support for details.'
  });
  toast(`Application ${status}.`, 'success');
  closeAppModal();
  loadPendingApplications(); loadAllRiders(); loadAnalytics();
}
async function loadAllRiders() {
  const { data, error } = await supabase.from('profiles').select('*, rider_applications!rider_applications_rider_id_fkey(vehicle_type, status)').eq('role', 'rider').order('created_at', { ascending: false });
  const tbody = document.querySelector('#riders-table tbody');
  if (error) { console.error('loadAllRiders error:', error); toast(error.message, 'error'); }
  if (!data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-motorcycle"></i><p>No riders yet.</p></div></td></tr>`; return; }

  const riderIds = data.map(r => r.id);
  const { data: allReviews } = await supabase.from('reviews').select('rider_id, rating').in('rider_id', riderIds);
  const reviewMap = {};
  (allReviews || []).forEach(rv => {
    if (!reviewMap[rv.rider_id]) reviewMap[rv.rider_id] = [];
    reviewMap[rv.rider_id].push(rv.rating);
  });
  const withRatings = data.map(r => {
    const ratings = reviewMap[r.id] || [];
    const avg = ratings.length ? (ratings.reduce((a, x) => a + x, 0) / ratings.length).toFixed(1) : '—';
    return { ...r, avgRating: avg };
  });

  tbody.innerHTML = withRatings.map(r => {
    const app = r.rider_applications?.[0];
    return `<tr>
      <td>${escapeHtml(r.full_name)}</td>
      <td>${escapeHtml(app?.vehicle_type || '—')}</td>
      <td>${app ? statusBadge(app.status) : '—'}</td>
      <td>${r.avgRating !== '—' ? r.avgRating + ' ★' : '—'}</td>
      <td>${formatDate(r.created_at)}</td>
      <td><div class="row-actions"><button class="icon-btn" title="${r.is_active ? 'Suspend' : 'Reactivate'}" onclick="toggleUserActive('${r.id}', ${r.is_active})"><i class="fa-solid ${r.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i></button></div></td>
    </tr>`;
  }).join('');
}

// ---- vehicles -------------------------------------------------------------
let ALL_VEHICLES = [];
async function loadVehicles() {
  const { data, error } = await supabase.from('vehicles').select('*').order('base_fare');
  if (error) { console.error('loadVehicles error:', error); toast(error.message, 'error'); }
  ALL_VEHICLES = data || [];
  const tbody = document.querySelector('#vehicles-table tbody');
  if (ALL_VEHICLES.length === 0) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-car"></i><p>No vehicle categories yet.</p></div></td></tr>`; return; }
  tbody.innerHTML = ALL_VEHICLES.map(v => `
    <tr>
      <td><i class="fa-solid ${v.icon}" style="margin-right:8px;color:var(--blue)"></i>${escapeHtml(v.name)}</td>
      <td>${v.capacity}</td><td>${peso(v.base_fare)}</td><td>${peso(v.per_km_rate)}</td>
      <td>${v.is_available ? '<span class="badge badge--completed">Yes</span>' : '<span class="badge badge--cancelled">No</span>'}</td>
      <td><div class="row-actions">
        <button class="icon-btn" onclick='openVehicleModal(${JSON.stringify(v)})'><i class="fa-solid fa-pen"></i></button>
        <button class="icon-btn danger" onclick="deleteVehicle('${v.id}')"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('');

  // populate visual chip grid above the table
  const chipGrid = document.getElementById('vehicle-chips');
  if (chipGrid) {
    chipGrid.innerHTML = ALL_VEHICLES.map(v => `
      <div class="vehicle-chip-item">
        <i class="fa-solid ${v.icon || 'fa-car'}"></i>
        <span>${escapeHtml(v.name)}</span>
        <small>${peso(v.base_fare)} base</small>
      </div>`).join('');
  }
}
function openVehicleModal(v) {
  document.getElementById('vehicle-modal-title').textContent = v ? 'Edit vehicle category' : 'Add vehicle category';
  document.getElementById('vehicle-id').value = v?.id || '';
  document.getElementById('vehicle-name').value = v?.name || '';
  document.getElementById('vehicle-icon').value = v?.icon || 'fa-car';
  document.getElementById('vehicle-capacity').value = v?.capacity || 1;
  document.getElementById('vehicle-available').value = String(v?.is_available ?? true);
  document.getElementById('vehicle-base').value = v?.base_fare || '';
  document.getElementById('vehicle-rate').value = v?.per_km_rate || '';
  document.getElementById('vehicle-modal').classList.add('open');
}
function closeVehicleModal() { document.getElementById('vehicle-modal').classList.remove('open'); }
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
    };
    if (!requireFields({ 'Name': payload.name, 'Base fare': payload.base_fare, 'Per-km rate': payload.per_km_rate })) return;

    const { error } = id ? await supabase.from('vehicles').update(payload).eq('id', id) : await supabase.from('vehicles').insert(payload);
    if (error) { toast(error.message, 'error'); return; }
    toast(id ? 'Vehicle updated.' : 'Vehicle added.', 'success');
    closeVehicleModal();
    loadVehicles();
  });
}
async function deleteVehicle(id) {
  if (!confirm('Delete this vehicle category? Existing bookings keep their history.')) return;
  const { error } = await supabase.from('vehicles').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  toast('Vehicle deleted.', 'success');
  loadVehicles();
}

// ---- bookings monitor -------------------------------------------------------
function wireBookingTabs() {
  document.querySelectorAll('.tab-btn[data-booking-kind]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn[data-booking-kind]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      BOOKING_KIND = btn.dataset.bookingKind;
      loadBookings();
    });
  });
}
async function loadBookings() {
  const table = TABLE_BY_KIND[BOOKING_KIND];
  const customerFk = BOOKING_KIND === 'transport' ? 'transport_bookings_customer_id_fkey' : BOOKING_KIND === 'food' ? 'food_deliveries_customer_id_fkey' : 'parcel_deliveries_customer_id_fkey';
  const { data, error } = await supabase.from(table).select('*, customer:customer_id(full_name), rider:rider_id(full_name)').order('created_at', { ascending: false }).limit(50);
  const tbody = document.querySelector('#bookings-table tbody');
  if (error || !data || data.length === 0) { tbody.innerHTML = `<tr><td colspan="6"><div class="empty-state"><i class="fa-solid fa-route"></i><p>No records yet.</p></div></td></tr>`; return; }
  tbody.innerHTML = data.map(b => {
    const title = BOOKING_KIND === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
      : BOOKING_KIND === 'food' ? b.restaurant_name : `${b.sender_name} → ${b.receiver_name}`;
    return `<tr>
      <td>${escapeHtml(title)}</td>
      <td>${escapeHtml(b.customer?.full_name || '—')}</td>
      <td>${escapeHtml(b.rider?.full_name || 'Unassigned')}</td>
      <td>${peso(b.final_fare ?? b.estimated_fare)}</td>
      <td>${statusBadge(b.status)}</td>
      <td>${formatDate(b.created_at)}</td>
    </tr>`;
  }).join('');
}

// ---- payments -------------------------------------------------------------
async function loadPayments() {
  const { data } = await supabase.from('payments').select('*, customer:customer_id(full_name), rider:rider_id(full_name)').order('created_at', { ascending: false }).limit(50);
  const rows = data || [];
  const totalRevenue = rows.reduce((a, r) => a + Number(r.amount), 0);
  const totalCommission = rows.reduce((a, r) => a + Number(r.platform_commission), 0);
  const totalPayout = rows.reduce((a, r) => a + Number(r.rider_payout), 0);

  document.getElementById('payment-stats').innerHTML = [
    ['Total processed', peso(totalRevenue), 'fa-money-bill-wave', 'var(--blue)'],
    ['Platform commission', peso(totalCommission), 'fa-percent', 'var(--orange)'],
    ['Rider payouts', peso(totalPayout), 'fa-hand-holding-dollar', 'var(--green)'],
  ].map(([label, value, icon, color]) => `
    <div class="stat-card"><div class="top"><div class="icon" style="background:${color}"><i class="fa-solid ${icon}"></i></div></div><strong>${value}</strong><span class="label">${label}</span></div>`).join('');

  const tbody = document.querySelector('#payments-table tbody');
  if (rows.length === 0) { tbody.innerHTML = `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-sack-dollar"></i><p>No transactions yet.</p></div></td></tr>`; return; }
  tbody.innerHTML = rows.map(p => `
    <tr>
      <td style="text-transform:capitalize">${p.booking_type}</td>
      <td>${peso(p.amount)}</td><td>${peso(p.platform_commission)}</td><td>${peso(p.rider_payout)}</td>
      <td style="text-transform:capitalize">${p.method}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${formatDate(p.created_at)}</td>
    </tr>`).join('');
}

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
    const { error } = await supabase.from('announcements').insert({ title, body, audience, created_by: CURRENT_PROFILE.id });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Announcement published!', 'success');
    e.target.reset();
    loadAnnouncements();
  });
}
async function loadAnnouncements() {
  const { data } = await supabase.from('announcements').select('*').order('created_at', { ascending: false }).limit(20);
  const el = document.getElementById('announcement-list');
  if (!data || data.length === 0) { el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-bullhorn"></i><p>Nothing published yet.</p></div>`; return; }
  el.innerHTML = data.map(a => `
    <div class="notif-item">
      <span class="dot" style="background:var(--orange)"></span>
      <div style="flex:1"><h4>${escapeHtml(a.title)}</h4><p>${escapeHtml(a.body)}</p><time>${formatDate(a.created_at)} · ${a.audience}</time></div>
    </div>`).join('');
}

// ---- realtime ------------------------------------------------------------
let realtimeTimer = null;
function debouncedReload(fns, delay = 1500) {
  clearTimeout(realtimeTimer);
  realtimeTimer = setTimeout(() => fns.forEach(f => f()), delay);
}
function subscribeRealtime() {
  supabase.channel('admin-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rider_applications' }, () => debouncedReload([loadPendingApplications, loadAllRiders, loadAnalytics]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_bookings' }, () => debouncedReload([loadBookings, loadAnalytics]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'food_deliveries' }, () => debouncedReload([loadBookings, loadAnalytics]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parcel_deliveries' }, () => debouncedReload([loadBookings, loadAnalytics]))
    .subscribe();
}
