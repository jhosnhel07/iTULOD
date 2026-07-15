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

  const { data: applications = [], error } = await supabase
    .from('rider_applications')
    .select('status')
    .eq('rider_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(1);

  const application = applications?.[0];
  if (error || !application || application.status !== 'approved') {
    return {
      allowed: false,
      message: 'Your rider account is pending admin approval. You will be able to access the rider dashboard after an administrator approves your credentials and documents.'
    };
  }

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
