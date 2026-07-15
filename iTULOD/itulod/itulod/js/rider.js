/**
 * iTULOD — rider dashboard
 */
let CURRENT_PROFILE = null;
let RIDER_APPROVED = false;
let HISTORY_KIND = 'transport';
let HISTORY_PAGE = 1;
const PAGE_SIZE = 6;
const TABLE_BY_KIND = { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries' };
const ICON_BY_KIND = { transport: 'fa-car', food: 'fa-utensils', parcel: 'fa-box' };
const COLOR_BY_KIND = { transport: 'var(--blue)', food: 'var(--orange)', parcel: 'var(--green)' };

(async function init() {
  CURRENT_PROFILE = await requireSession(['rider']);
  if (!CURRENT_PROFILE) return;

  document.getElementById('side-name').textContent = CURRENT_PROFILE.full_name;
  document.getElementById('side-avatar').textContent = initials(CURRENT_PROFILE.full_name);
  if (CURRENT_PROFILE.avatar_url) setAvatarImg(document.getElementById('side-avatar'), CURRENT_PROFILE.avatar_url);

  await checkApproval();
  wireTabNav();
  initNavigationMap('nav-map');
  wireHistoryTabs();
  wireProfileForm();
  populateProfileForm();

  await loadRequests();
  await loadAccepted();
  await loadEarnings();
  await loadHistory();
  await loadVehicleInfo();
  subscribeRealtime();
})();

function initials(name) { return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase(); }
function setAvatarImg(el, url) { el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; }

async function checkApproval() {
  const { data } = await supabase.from('rider_applications').select('*').eq('rider_id', CURRENT_PROFILE.id).order('created_at', { ascending: false }).limit(1).single();
  RIDER_APPROVED = data?.status === 'approved';
  const banner = document.getElementById('approval-banner');
  if (data && data.status !== 'approved') {
    banner.innerHTML = `<span class="badge ${data.status === 'pending' ? 'badge--pending' : 'badge--cancelled'}">
      Application ${data.status}${data.status === 'pending' ? ' — you can browse but not accept bookings yet' : ''}
    </span>`;
  }
}

// ---- tab nav ---------------------------------------------------------
function wireTabNav() {
  document.querySelectorAll('.side-link[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.side-link[data-tab]').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
      const titles = {
        requests: ['Booking requests', 'New bookings waiting for a rider.'],
        accepted: ['Accepted bookings', 'Your current rides and deliveries.'],
        earnings: ['Earnings', 'Track your daily, weekly, and monthly income.'],
        history: ['History', 'Completed and cancelled bookings.'],
        vehicle: ['Vehicle info', 'Your application and vehicle details.'],
        profile: ['Profile', 'Manage your account details.']
      }[btn.dataset.tab];
      document.getElementById('page-title').textContent = titles[0];
      document.getElementById('page-sub').textContent = titles[1];
      document.getElementById('sidebar').classList.remove('open');
    });
  });
}

// ---- booking requests (unassigned, pending) ---------------------------
async function loadRequests() {
  const list = document.getElementById('requests-list');
  const results = await Promise.all(Object.keys(TABLE_BY_KIND).map(kind =>
    supabase.from(TABLE_BY_KIND[kind]).select('*').is('rider_id', null).eq('status', 'pending').order('created_at', { ascending: false }).then(r => ({ kind, rows: r.data || [] }))
  ));
  const merged = results.flatMap(r => r.rows.map(row => ({ ...row, _kind: r.kind }))).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  if (merged.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No booking requests right now. Check back soon!</p></div>`;
    return;
  }
  list.innerHTML = merged.map(b => renderRequestCard(b, b._kind)).join('');
}

function renderRequestCard(b, kind) {
  const title = kind === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
    : kind === 'food' ? `${b.restaurant_name} → ${b.delivery_address}`
    : `${b.sender_address} → ${b.receiver_address}`;
  const fare = b.estimated_fare;
  return `
    <div class="booking-card">
      <div class="kind-icon" style="background:${COLOR_BY_KIND[kind]}"><i class="fa-solid ${ICON_BY_KIND[kind]}"></i></div>
      <div class="info"><div><h4>${escapeHtml(title)}</h4><p>${kind[0].toUpperCase() + kind.slice(1)} · ${formatDate(b.created_at)}</p></div></div>
      <div class="meta">
        <span class="fare">${peso(fare)}</span>
        <button class="btn btn-primary btn-sm" ${RIDER_APPROVED ? '' : 'disabled title="Wait for admin approval"'} onclick="acceptBooking('${kind}','${b.id}')">Accept</button>
      </div>
    </div>`;
}

async function acceptBooking(kind, id) {
  const table = TABLE_BY_KIND[kind];
  const { error } = await supabase.from(table).update({ rider_id: CURRENT_PROFILE.id, status: 'accepted' }).eq('id', id).is('rider_id', null);
  if (error) { toast(error.message, 'error'); return; }
  toast('Booking accepted!', 'success');
  await loadRequests();
  await loadAccepted();
  // Show route on nav map for the accepted booking
  const { data: b } = await supabase.from(table).select('*').eq('id', id).single();
  if (b) {
    const pickup = kind === 'transport' ? b.pickup_address : kind === 'food' ? b.pickup_address : b.sender_address;
    const dropoff = kind === 'transport' ? b.destination_address : kind === 'food' ? b.delivery_address : b.receiver_address;
    showRiderRoute(pickup, dropoff);
  }
}

// ---- accepted bookings (mine, accepted/ongoing) ------------------------
async function loadAccepted() {
  const list = document.getElementById('accepted-list');
  const results = await Promise.all(Object.keys(TABLE_BY_KIND).map(kind =>
    supabase.from(TABLE_BY_KIND[kind]).select('*').eq('rider_id', CURRENT_PROFILE.id).in('status', ['accepted', 'ongoing']).order('created_at', { ascending: false }).then(r => ({ kind, rows: r.data || [] }))
  ));
  const merged = results.flatMap(r => r.rows.map(row => ({ ...row, _kind: r.kind })));

  if (merged.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-route"></i><p>No active bookings. Accept a request to get started.</p></div>`;
    return;
  }
  list.innerHTML = merged.map(b => renderAcceptedCard(b, b._kind)).join('');
}

function renderAcceptedCard(b, kind) {
  const title = kind === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
    : kind === 'food' ? `${b.restaurant_name} → ${b.delivery_address}`
    : `${b.sender_address} → ${b.receiver_address}`;
  const nextAction = b.status === 'accepted'
    ? `<button class="btn btn-outline btn-sm" onclick="updateStatus('${kind}','${b.id}','ongoing')">Start trip</button>`
    : `<button class="btn btn-primary btn-sm" onclick="updateStatus('${kind}','${b.id}','completed')">Mark complete</button>`;
  const paymentNote = kind === 'transport' && b.payment_method !== 'cash'
    ? `<span class="badge ${b.payment_status === 'paid' ? 'badge--completed' : 'badge--pending'}">${b.payment_method === 'gcash' ? 'GCash' : 'Card'} · ${b.payment_status}</span>`
    : '';
  return `
    <div class="booking-card">
      <div class="kind-icon" style="background:${COLOR_BY_KIND[kind]}"><i class="fa-solid ${ICON_BY_KIND[kind]}"></i></div>
      <div class="info"><div><h4>${escapeHtml(title)}</h4><p>${statusBadge(b.status)} ${paymentNote}</p></div></div>
      <div class="meta">
        <span class="fare">${peso(b.estimated_fare)}</span>
        ${nextAction}
      </div>
    </div>`;
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

  const patch = { status };
  if (status === 'completed') {
    const { data: row } = await supabase.from(table).select('estimated_fare').eq('id', id).single();
    patch.final_fare = row?.estimated_fare;
  }
  const { error } = await supabase.from(table).update(patch).eq('id', id);
  if (error) { toast(error.message, 'error'); return; }

  if (status === 'completed') {
    const { data: row } = await supabase.from(table).select('*').eq('id', id).single();
    const commission = Number((row.final_fare * 0.15).toFixed(2));
    const method = row.payment_method || 'cash'; // food/parcel don't have this column set meaningfully yet — defaults to cash
    await supabase.from('payments').insert({
      customer_id: row.customer_id, rider_id: CURRENT_PROFILE.id, booking_type: kind, booking_id: id,
      amount: row.final_fare, platform_commission: commission, rider_payout: Number((row.final_fare - commission).toFixed(2)),
      method, status: 'paid'
    });
    // Cash is only ever marked paid here, at completion, since the rider
    // physically collects it. GCash/Card were already marked paid earlier
    // by the paymongo-webhook function, so this is a no-op for those but
    // kept here so payment_status always reflects reality if it somehow lagged.
    if (method === 'cash') await supabase.from(table).update({ payment_status: 'paid' }).eq('id', id);
  }
  toast('Status updated!', 'success');
  await loadAccepted();
  await loadEarnings();
  await loadHistory();
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
  const { data, error } = await supabase.from(table).select('*').eq('rider_id', CURRENT_PROFILE.id).in('status', ['completed', 'cancelled']).order('created_at', { ascending: false });
  const list = document.getElementById('history-list');
  if (error || !data || data.length === 0) {
    list.innerHTML = `<div class="empty-state"><i class="fa-solid fa-inbox"></i><p>No completed bookings in this category yet.</p></div>`;
    document.getElementById('history-pagination').innerHTML = '';
    return;
  }
  const { slice, totalPages } = paginate(data, HISTORY_PAGE, PAGE_SIZE);
  list.innerHTML = slice.map(b => {
    const title = HISTORY_KIND === 'transport' ? `${b.pickup_address} → ${b.destination_address}`
      : HISTORY_KIND === 'food' ? b.restaurant_name : `${b.sender_name} → ${b.receiver_name}`;
    return `
      <div class="booking-card">
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
  const { data } = await supabase.from('rider_applications').select('*').eq('rider_id', CURRENT_PROFILE.id).order('created_at', { ascending: false }).limit(1).single();
  const el = document.getElementById('vehicle-info');
  if (!data) { el.innerHTML = `<div class="empty-state"><i class="fa-solid fa-file-circle-question"></i><p>No application on file.</p></div>`; return; }
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

// ---- realtime ------------------------------------------------------------
function subscribeRealtime() {
  supabase.channel('rider-updates')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'transport_bookings' }, () => { loadRequests(); loadAccepted(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'food_deliveries' }, () => { loadRequests(); loadAccepted(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'parcel_deliveries' }, () => { loadRequests(); loadAccepted(); })
    .subscribe();
}
