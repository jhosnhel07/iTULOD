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
  wireRestaurantForm();
  wireMenuItemForm();
  wireAnnouncementForm();
  wirePromoForm();
  wireSupportSubTabs();

  await loadAnalytics();
  await loadCustomers();
  await loadPendingApplications();
  await loadAllRiders();
  await loadVehicles();
  await loadRestaurants();
  await loadPromoCodes();
  await loadSupportRequests();
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
      document.querySelectorAll('#tab-analytics, #tab-customers, #tab-riders, #tab-vehicles, #tab-restaurants, #tab-support, #tab-bookings, #tab-payments, #tab-announcements, #tab-settings').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      const titles = {
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
      }[btn.dataset.tab];
      document.getElementById('page-title').textContent = titles[0];
      document.getElementById('page-sub').textContent = titles[1];
      closeSidebar();
    });
  });
}

// ---- analytics ----------------------------------------------------------
async function loadAnalytics() {
  const [{ count: customerCount }, { count: riderCount }, { count: pendingApps }] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('rider_applications').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
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
          <p style="color:var(--text-muted);font-size:0.8rem">${escapeHtml(email)} · ${escapeHtml(phone)} · Applied ${submittedDate}</p>
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

function updatePendingBadge(count) {
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
    badge.style.cssText = 'display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:20px;padding:0 6px;background:var(--red,#ef4444);color:#fff;border-radius:10px;font-size:0.72rem;font-weight:700;margin-left:6px;';
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
    : `<div style="width:64px;height:64px;border-radius:50%;background:var(--blue);display:flex;align-items:center;justify-content:center;font-size:1.4rem;font-weight:700;color:#fff">${initials_}</div>`;

  document.getElementById('app-modal-body').innerHTML = `
    <!-- Rider Profile Header -->
    <div style="display:flex;align-items:center;gap:14px;padding:16px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:16px">
      ${avatarHtml}
      <div>
        <div style="font-size:1.05rem;font-weight:700;color:var(--ink)">${escapeHtml(name)}</div>
        <div style="font-size:0.85rem;color:var(--text-muted)">${escapeHtml(rider?.email || '—')}</div>
        <div style="font-size:0.85rem;color:var(--text-muted)">${escapeHtml(rider?.phone || 'No phone on file')}</div>
        <div style="margin-top:4px"><span class="badge badge--pending">Pending Review</span></div>
      </div>
    </div>

    <!-- Application Details -->
    <div style="font-size:0.88rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Vehicle Information</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:2px">Vehicle Type</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.vehicle_type || '—')}</div>
      </div>
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:2px">Vehicle Model</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.vehicle_model || '—')}</div>
      </div>
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:2px">Plate Number</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.vehicle_plate || '—')}</div>
      </div>
      <div style="padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
        <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:2px">License Number</div>
        <div style="font-weight:600;color:var(--ink)">${escapeHtml(app.license_number || '—')}</div>
      </div>
    </div>

    <!-- Documents -->
    <div style="font-size:0.88rem;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:8px">Documents</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">
      ${app.license_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-id-card" style="color:var(--blue)"></i>
               <div><div style="font-size:0.85rem;font-weight:600">Driver's License</div><div style="font-size:0.78rem;color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.license_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.85rem"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No driver's license uploaded</div>`
      }
      ${app.or_cr_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-file-lines" style="color:var(--orange)"></i>
               <div><div style="font-size:0.85rem;font-weight:600">OR/CR (Vehicle Registration)</div><div style="font-size:0.78rem;color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.or_cr_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.85rem"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No OR/CR uploaded</div>`
      }
      ${app.selfie_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-camera" style="color:var(--blue)"></i>
               <div><div style="font-size:0.85rem;font-weight:600">Selfie Verification</div><div style="font-size:0.78rem;color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.selfie_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.85rem"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No selfie uploaded</div>`
      }
      ${app.vehicle_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-motorcycle" style="color:var(--orange)"></i>
               <div><div style="font-size:0.85rem;font-weight:600">Vehicle Photo</div><div style="font-size:0.78rem;color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.vehicle_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.85rem"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No vehicle photo uploaded</div>`
      }
      ${app.nbi_url
        ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--bg);border:1px solid var(--border);border-radius:var(--radius-sm)">
             <div style="display:flex;align-items:center;gap:10px">
               <i class="fa-solid fa-shield-halved" style="color:var(--blue)"></i>
               <div><div style="font-size:0.85rem;font-weight:600">NBI Clearance</div><div style="font-size:0.78rem;color:var(--text-muted)">Click to open in new tab</div></div>
             </div>
             <a href="${app.nbi_url}" target="_blank" class="btn btn-outline btn-sm"><i class="fa-solid fa-arrow-up-right-from-square"></i> View</a>
           </div>`
        : `<div style="padding:10px 14px;background:var(--bg);border:1px dashed var(--border);border-radius:var(--radius-sm);color:var(--text-muted);font-size:0.85rem"><i class="fa-regular fa-file-lines" style="margin-right:6px"></i>No NBI clearance uploaded (optional)</div>`
      }
    </div>

    <!-- Metadata -->
    <div style="font-size:0.78rem;color:var(--text-muted);border-top:1px solid var(--border);padding-top:10px">
      <i class="fa-regular fa-clock" style="margin-right:4px"></i>Application submitted: <strong>${formatDate(app.created_at)}</strong>
      &nbsp;·&nbsp; Application ID: <code style="font-size:0.75rem;background:var(--bg);padding:2px 6px;border-radius:4px">${app.id}</code>
    </div>
  `;
  document.getElementById('app-modal').classList.add('open');
}

function closeAppModal() { document.getElementById('app-modal').classList.remove('open'); }

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
      <td>${escapeHtml(app.vehicle_type || '—')}</td>
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
    tbody.innerHTML = `<tr><td colspan="6">${emptyState({
      icon: 'fa-car',
      title: 'No vehicle categories',
      body: 'Add a category so customers have something to book.'
    })}</td></tr>`;
    return;
  }
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
function openRestaurantModal(r) {
  document.getElementById('restaurant-modal-title').textContent = r ? 'Edit restaurant' : 'Add restaurant';
  document.getElementById('restaurant-id').value = r?.id || '';
  document.getElementById('restaurant-name').value = r?.name || '';
  document.getElementById('restaurant-address').value = r?.address || '';
  document.getElementById('restaurant-cuisine').value = r?.cuisine_type || '';
  document.getElementById('restaurant-available').value = String(r?.is_active ?? true);
  document.getElementById('restaurant-image').value = r?.image_url || '';
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
  if (!confirm('Delete this restaurant and its whole menu? Existing orders keep their history.')) return;
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
    tbody.innerHTML = `<tr><td colspan="4">${emptyState({ icon: 'fa-utensils', title: 'No items yet', body: 'Add this restaurant\'s menu above.' })}</td></tr>`;
    return;
  }
  tbody.innerHTML = data.map(m => `
    <tr>
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
  if (!confirm('Delete this menu item?')) return;
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
      BOOKINGS_PAGE = 1;
      loadBookings();
    });
  });
}
async function loadBookings() {
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
  const rows = ALL_PAYMENTS;
  const totalRevenue = rows.reduce((a, r) => a + Number(r.amount), 0);
  const totalCommission = rows.reduce((a, r) => a + Number(r.platform_commission), 0);
  const totalPayout = rows.reduce((a, r) => a + Number(r.rider_payout), 0);

  document.getElementById('payment-stats').innerHTML = [
    ['Total processed', peso(totalRevenue), 'fa-money-bill-wave', 'var(--blue)'],
    ['Platform commission', peso(totalCommission), 'fa-percent', 'var(--orange)'],
    ['Rider payouts', peso(totalPayout), 'fa-hand-holding-dollar', 'var(--green)'],
  ].map(([label, value, icon, color]) => `
    <div class="stat-card"><div class="top"><div class="icon" style="background:${color}"><i class="fa-solid ${icon}"></i></div></div><strong>${value}</strong><span class="label">${label}</span></div>`).join('');

  renderPaymentsPage();
}
function renderPaymentsPage() {
  const tbody = document.querySelector('#payments-table tbody');
  const pager = document.getElementById('payments-pagination');
  if (ALL_PAYMENTS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">${emptyState({
      icon: 'fa-sack-dollar',
      title: 'No transactions yet',
      body: 'Payments appear here as bookings are completed and paid.'
    })}</td></tr>`;
    if (pager) pager.innerHTML = '';
    return;
  }
  const { slice, totalPages } = paginate(ALL_PAYMENTS, PAYMENTS_PAGE, ADMIN_PAGE_SIZE);
  tbody.innerHTML = slice.map(p => `
    <tr>
      <td style="text-transform:capitalize">${p.booking_type}</td>
      <td>${peso(p.amount)}</td><td>${peso(p.platform_commission)}</td><td>${peso(p.rider_payout)}</td>
      <td style="text-transform:capitalize">${p.method}</td>
      <td>${statusBadge(p.status)}</td>
      <td>${formatDate(p.created_at)}</td>
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
    const { error } = await supabase.from('announcements').insert({ title, body, audience, created_by: CURRENT_PROFILE.id });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Announcement published!', 'success');
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_bookings' }, () => debouncedReload([loadBookings, loadAnalytics, loadPayments]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'food_deliveries' }, () => debouncedReload([loadBookings, loadAnalytics, loadPayments]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parcel_deliveries' }, () => debouncedReload([loadBookings, loadAnalytics, loadPayments]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => debouncedReload([loadPayments]))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'support_requests' }, () => debouncedReload([loadSupportRequests]))
    .subscribe();
}

// ---- promo codes -----------------------------------------------------------
let ALL_PROMOS = [];
async function loadPromoCodes() {
  const tbody = document.querySelector('#promo-table tbody');
  if (!tbody) return;
  const { data, error } = await supabase.from('promo_codes').select('*').order('created_at', { ascending: false });
  if (error) { console.error('loadPromoCodes error:', error); return; }
  ALL_PROMOS = data || [];
  if (ALL_PROMOS.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState({ icon: 'fa-tag', title: 'No promo codes yet', body: 'Create one above — transport bookings only, for now.' })}</td></tr>`;
    return;
  }
  tbody.innerHTML = ALL_PROMOS.map(p => `
    <tr>
      <td><code>${escapeHtml(p.code)}</code></td>
      <td>${p.discount_type === 'percent' ? Number(p.discount_value) + '%' : peso(p.discount_value)}</td>
      <td>${p.uses_count}${p.max_uses ? ' / ' + p.max_uses : ''}</td>
      <td>${p.active ? '<span class="badge badge--completed">Active</span>' : '<span class="badge badge--cancelled">Inactive</span>'}</td>
      <td><div class="row-actions">
        <button class="icon-btn" title="${p.active ? 'Deactivate' : 'Activate'}" onclick="togglePromoActive('${p.id}', ${p.active})"><i class="fa-solid ${p.active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i></button>
        <button class="icon-btn danger" title="Delete" onclick="deletePromoCode('${p.id}')"><i class="fa-solid fa-trash"></i></button>
      </div></td>
    </tr>`).join('');
}
function wirePromoForm() {
  const form = document.getElementById('promo-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('promo-submit');
    const code = document.getElementById('promo-code').value.trim().toUpperCase();
    const discount_type = document.getElementById('promo-type').value;
    const discount_value = parseFloat(document.getElementById('promo-value').value);
    const maxUsesRaw = document.getElementById('promo-max-uses').value;
    const max_uses = maxUsesRaw ? parseInt(maxUsesRaw, 10) : null;
    if (!requireFields({ Code: code, Value: discount_value })) return;
    if (discount_type === 'percent' && discount_value > 100) {
      toast("A percentage discount can't be more than 100.", 'error');
      return;
    }
    setLoading(btn, true);
    const { error } = await supabase.from('promo_codes').insert({
      code, discount_type, discount_value, max_uses, created_by: CURRENT_PROFILE.id,
    });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    toast('Promo code created.', 'success');
    form.reset();
    await loadPromoCodes();
  });
}
async function togglePromoActive(id, currentlyActive) {
  const { error } = await supabase.from('promo_codes').update({ active: !currentlyActive }).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  await loadPromoCodes();
}
async function deletePromoCode(id) {
  if (!confirm('Delete this promo code? This does not undo discounts already given.')) return;
  const { error } = await supabase.from('promo_codes').delete().eq('id', id);
  if (error) { toast(error.message, 'error'); return; }
  await loadPromoCodes();
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
      <div style="color:var(--text-muted);font-size:0.85rem">${escapeHtml(req.customer?.email || '')}</div>
    </div>
    <div style="margin-bottom:14px"><span class="badge badge--pending">${escapeHtml(req.category)}</span> ${statusBadge(req.status)}</div>
    <div style="margin-bottom:14px">
      <div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Message</div>
      <p>${escapeHtml(req.message)}</p>
    </div>
    ${req.booking_id ? `<div style="margin-bottom:14px;font-size:0.85rem;color:var(--text-muted)">Booking: ${escapeHtml(req.booking_type || '')} · ${escapeHtml(req.booking_id)}</div>` : ''}
    ${req.admin_response ? `<div style="margin-bottom:14px"><div style="font-size:0.78rem;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Your previous reply</div><p>${escapeHtml(req.admin_response)}</p></div>` : ''}
    ${req.status !== 'resolved' ? `
      <div class="field" style="margin-bottom:0">
        <label>Reply to customer</label>
        <textarea id="support-reply" rows="4" placeholder="Explain what you're doing about this…"></textarea>
      </div>` : ''}
  `;
  document.getElementById('support-resolve-btn').style.display = req.status === 'resolved' ? 'none' : '';
  document.getElementById('support-modal').classList.add('open');
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

// ---- database backup (export only — see admin/dashboard.html for why
// restore isn't offered as an in-app action) --------------------------------
const BACKUP_TABLES = [
  'profiles', 'rider_applications', 'vehicles',
  'transport_bookings', 'food_deliveries', 'parcel_deliveries',
  'payments', 'reviews', 'notifications', 'announcements', 'platform_config',
  'saved_addresses', 'promo_codes', 'promo_redemptions', 'support_requests',
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
