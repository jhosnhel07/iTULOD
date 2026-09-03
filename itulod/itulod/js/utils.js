/**
 * iTULOD — shared utility helpers
 */

// ---- Toasts -----------------------------------------------------------
function toast(message, type = 'info') {
  let host = document.getElementById('toast-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'toast-host';
    document.body.appendChild(host);
  }
  const el = document.createElement('div');
  el.className = `toast toast--${type}`;
  el.innerHTML = `<i class="fa-solid ${toastIcon(type)}"></i><span>${escapeHtml(message)}</span>`;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('toast--show'));
  setTimeout(() => {
    el.classList.remove('toast--show');
    setTimeout(() => el.remove(), 250);
  }, 3800);
}
function toastIcon(type) {
  return { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' }[type] || 'fa-circle-info';
}

// ---- Loading indicator --------------------------------------------------
function setLoading(el, isLoading, labelWhenIdle = null) {
  if (!el) return;
  if (isLoading) {
    el.dataset.idleLabel = labelWhenIdle ?? el.innerHTML;
    el.disabled = true;
    el.innerHTML = `<span class="spinner"></span> Working…`;
  } else {
    el.disabled = false;
    el.innerHTML = el.dataset.idleLabel ?? el.innerHTML;
  }
}

// ---- Mobile sidebar drawer ----------------------------------------------
// The drawer sits above the mobile topbar (z-index 90 vs 60), so once it is
// open the hamburger that opened it is covered. These add a scrim you can tap
// to dismiss, plus Escape, so picking a nav item is no longer the only way out.
function sidebarScrim() {
  let scrim = document.getElementById('sidebar-scrim');
  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'sidebar-scrim';
    scrim.className = 'sidebar-scrim';
    scrim.addEventListener('click', closeSidebar);
    document.body.appendChild(scrim);
  }
  return scrim;
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const open = sidebar.classList.toggle('open');
  sidebarScrim().classList.toggle('open', open);
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');
  // Read from the DOM rather than sidebarScrim() so closing never creates the
  // element on pages that have no drawer.
  const scrim = document.getElementById('sidebar-scrim');
  if (scrim) scrim.classList.remove('open');
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeSidebar();
});

// ---- Empty states --------------------------------------------------------
// One shape for every "nothing here" panel. The dashboards' hand-written
// versions had only an icon and a line of text, which left .empty-state h4
// styled but unused, so a loaded-but-empty list read as weaker than the
// static fallback markup in the HTML.
function emptyState({ icon, title, body = '', tone = null }) {
  const color = { error: 'var(--red)', success: 'var(--green)' }[tone] || null;
  return `
    <div class="empty-state">
      <i class="fa-solid ${icon}"${color ? ` style="color:${color}"` : ''}></i>
      <h4>${escapeHtml(title)}</h4>
      ${body ? `<p>${escapeHtml(body)}</p>` : ''}
    </div>`;
}

// ---- Loading skeletons ---------------------------------------------------
// Painted into a container before its query is awaited, so a tab opens showing
// the shape of what is coming instead of a blank gap that content pops into.
function skeletonList(count = 3) {
  return `
    <div class="skeleton-card">
      <div class="skeleton skeleton-avatar"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line skeleton-line--w60"></div>
        <div class="skeleton skeleton-line skeleton-line--sm skeleton-line--w40"></div>
      </div>
      <div class="skeleton-meta">
        <div class="skeleton skeleton-line"></div>
        <div class="skeleton skeleton-line skeleton-line--sm"></div>
      </div>
    </div>`.repeat(count);
}

// `cols` must match the table's column count or the placeholder row will not
// span the full width.
function skeletonRows(count, cols) {
  const widths = ['skeleton-line--w80', 'skeleton-line--w60', 'skeleton-line--w40'];
  return [...Array(count)].map((_, i) => `
    <tr>
      <td colspan="${cols}">
        <div class="skeleton skeleton-line ${widths[i % widths.length]}"></div>
      </td>
    </tr>`).join('');
}

// Paints `html` into `el` only the first time a given dataset is requested.
// The loader functions double as realtime handlers and pagination handlers, so
// an unconditional skeleton would flash a shimmer over content already on
// screen every time a booking changes. Pass a `key` that identifies the
// dataset (e.g. the history category) to get one skeleton per switch.
function showSkeleton(el, html, key = 'default') {
  if (!el || el.dataset.loadedKey === key) return;
  el.dataset.loadedKey = key;
  el.innerHTML = html;
}

// ---- Formatting --------------------------------------------------------
function peso(amount) {
  const n = Number(amount || 0);
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}
function statusBadge(status) {
  const map = {
    pending: 'badge--pending', accepted: 'badge--accepted', ongoing: 'badge--ongoing',
    completed: 'badge--completed', cancelled: 'badge--cancelled',
    approved: 'badge--completed', rejected: 'badge--cancelled'
  };
  return `<span class="badge ${map[status] || 'badge--pending'}">${status}</span>`;
}

// One booking-list row, used on the customer history/home and the rider
// requests/accepted lists. Fixed layout: fare + status always sit top-right,
// the payment badge always bottom-left, action buttons always bottom-right —
// so nothing shifts between cards.
function bookingCardHTML({ kind, id, iconBg, icon, title, sub, fare, status = '', footLeft = '', actions = '', clickable = true }) {
  const open = `openBookingDetails({ kind: '${kind}', id: '${id}' })`;
  const clickAttrs = clickable
    ? ` role="button" tabindex="0" onclick="${open}" onkeydown="if(event.key==='Enter'||event.key===' '){ ${open} }"`
    : '';
  const foot = (footLeft || actions)
    ? `<div class="booking-card__foot"><div class="booking-card__foot-l">${footLeft}</div><div class="booking-card__foot-r">${actions}</div></div>`
    : '';
  return `
    <div class="booking-card"${clickAttrs}>
      <div class="booking-card__main">
        <div class="kind-icon" style="background:${iconBg}"><i class="fa-solid ${icon}"></i></div>
        <div class="info"><div><h4>${escapeHtml(title)}</h4><p>${escapeHtml(sub)}</p></div></div>
        <div class="booking-card__end">
          <span class="fare">${peso(fare)}</span>
          ${status ? statusBadge(status) : ''}
        </div>
      </div>
      ${foot}
    </div>`;
}

// ---- Fare estimation (base fare + per-km rate; distance is simulated
// from the two typed addresses since no live map/geocoding is wired in) --
function estimateFare(vehicle, distanceKm) {
  if (!vehicle) return 0;
  return Number(vehicle.base_fare) + Number(vehicle.per_km_rate) * Number(distanceKm || 1);
}
function simulateDistanceKm(pickup, destination) {
  // Deterministic placeholder distance (1–15km) so the same pickup/destination
  // pair always estimates the same fare until real geocoding is connected.
  const seed = (pickup + destination).split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  return Math.max(1, (seed % 140) / 10);
}

// ---- Simple client-side validation --------------------------------------
function requireFields(fields) {
  for (const [label, value] of Object.entries(fields)) {
    if (value === undefined || value === null || String(value).trim() === '') {
      toast(`${label} is required.`, 'error');
      return false;
    }
  }
  return true;
}

// ---- Form draft persistence --------------------------------------------
function saveFormDraft(storageKey, form, extraState = {}) {
  if (!form) return;
  const payload = { ...extraState };
  form.querySelectorAll('input, textarea, select').forEach(el => {
    const key = el.id || el.name || '';
    if (!key) return;

    if (el.type === 'checkbox') {
      payload[key] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) payload[key] = el.value;
    } else if (el.type === 'file') {
      payload[key] = null;
    } else if (el.tagName === 'SELECT') {
      payload[key] = el.value;
    } else {
      payload[key] = el.value;
    }
  });
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function restoreFormDraft(storageKey, form, extraKeys = {}) {
  if (!form) return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const payload = JSON.parse(raw);

    form.querySelectorAll('input, textarea, select').forEach(el => {
      const key = el.id || el.name || '';
      if (!key || !(key in payload)) return;
      const value = payload[key];

      if (el.type === 'checkbox') {
        el.checked = !!value;
      } else if (el.type === 'radio') {
        el.checked = el.value === value;
      } else if (el.type !== 'file') {
        el.value = value ?? '';
      }
    });

    Object.entries(extraKeys).forEach(([key, value]) => {
      if (key in payload) {
        extraKeys[key] = payload[key];
      }
    });

    return payload;
  } catch (_) {
    return null;
  }
}

function clearFormDraft(storageKey) {
  localStorage.removeItem(storageKey);
}

// ---- Path helpers --------------------------------------------------------
// Dashboard pages live one level down (customer/, rider/, admin/), while
// login/register live at the site root. This keeps redirects correct
// no matter which page calls them, including on a GitHub Pages subpath.
function rootPath() {
  return location.pathname.match(/\/(customer|rider|admin)\//) ? '../' : '';
}
function redirectForRole(role) {
  const map = { admin: 'admin/dashboard.html', rider: 'rider/dashboard.html', customer: 'customer/dashboard.html' };
  return rootPath() + (map[role] || 'login.html');
}

async function ensureRiderApproval(profile) {
  if (profile?.role !== 'rider') return { allowed: true };

  // Safety guard: if id is missing from the profile object the query would
  // match nothing and always block the rider — catch it explicitly.
  if (!profile?.id) {
    console.error('ensureRiderApproval: profile.id is missing. Make sure the profile select includes the id column.');
    return {
      allowed: false,
      message: 'Could not verify your rider approval status. Please try again or contact support.'
    };
  }

  const { data: applications, error } = await supabase
    .from('rider_applications')
    .select('status')
    .eq('rider_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1);

  if (error) {
    console.error('ensureRiderApproval query error:', error);
    // Do NOT block login on a query error — let the dashboard handle it
    return { allowed: true, queryError: true };
  }

  const application = applications?.[0];

  if (!application) {
    // No application on record — allow login so the rider dashboard can
    // attempt recovery (e.g., re-submit from localStorage backup).
    // The dashboard will show an appropriate banner.
    return { allowed: true, noApplication: true };
  }

  if (application.status === 'approved') {
    return { allowed: true };
  }

  if (application.status === 'rejected') {
    return {
      allowed: false,
      message: 'Your rider application was not approved. Please contact support for more information.'
    };
  }

  // status === 'pending' — allow login. The rider dashboard shows a
  // "pending approval" banner and disables booking acceptance.
  return { allowed: true };
}

// ---- Auth/session guard used at the top of every dashboard page --------
async function requireSession(allowedRoles) {
  document.body.style.visibility = 'hidden';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    window.location.href = rootPath() + 'login.html';
    return null;
  }
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', session.user.id)
    .single();

  if (error || !profile) {
    toast('Could not load your profile.', 'error');
    await supabase.auth.signOut();
    window.location.href = rootPath() + 'login.html';
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(profile.role)) {
    window.location.href = redirectForRole(profile.role);
    return null;
  }

  const approval = await ensureRiderApproval(profile);
  if (!approval.allowed) {
    toast(approval.message, 'info');
    await supabase.auth.signOut();
    window.location.href = rootPath() + 'login.html';
    return null;
  }

  document.body.style.visibility = 'visible';
  return profile;
}

// ---- Pagination helper ---------------------------------------------------
function paginate(items, page, pageSize) {
  const start = (page - 1) * pageSize;
  return {
    slice: items.slice(start, start + pageSize),
    totalPages: Math.max(1, Math.ceil(items.length / pageSize))
  };
}
