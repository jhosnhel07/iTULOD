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

// ---- Light / dark theme ---------------------------------------------------
// No saved choice → follow the device setting. A tap on any .js-theme-toggle
// saves 'light' or 'dark' on this device. The saved choice is applied before
// first paint by a small inline script in each dashboard's <head>.
const THEME_KEY = 'itulod-theme';
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function syncThemeToggles() {
  const dark = currentTheme() === 'dark';
  document.querySelectorAll('.js-theme-toggle').forEach((b) => {
    const icon = b.querySelector('i');
    if (icon) icon.className = 'fa-solid ' + (dark ? 'fa-sun' : 'fa-moon');
    const label = b.querySelector('.js-theme-label');
    if (label) label.textContent = dark ? 'Light mode' : 'Dark mode';
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    b.setAttribute('aria-pressed', String(dark));
  });
}
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private mode: applies for this visit only */ }
  syncThemeToggles();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncThemeToggles);
else syncThemeToggles();
// Keep the icon right when the device flips theme and no choice is saved.
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeToggles);

// ---- Confirm dialog -----------------------------------------------------
// Branded replacement for window.confirm(): resolves true on confirm, false on
// cancel / Esc / backdrop click. `danger` styles the confirm button red for
// destructive actions (delete, cancel booking, no-show).
function appConfirm(message, { title = 'Are you sure?', confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = null } = {}) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    overlay.innerHTML = `
      <div class="app-dialog ${danger ? 'app-dialog--danger' : ''}" role="alertdialog" aria-modal="true"
           aria-labelledby="app-dialog-title" aria-describedby="app-dialog-msg">
        <div class="app-dialog__icon"><i class="fa-solid ${icon || (danger ? 'fa-triangle-exclamation' : 'fa-circle-question')}"></i></div>
        <h3 id="app-dialog-title">${escapeHtml(title)}</h3>
        <p id="app-dialog-msg">${escapeHtml(message)}</p>
        <div class="app-dialog__actions">
          <button type="button" class="btn btn-outline" data-act="cancel">${escapeHtml(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${escapeHtml(confirmText)}</button>
        </div>
      </div>`;
    const close = (result) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.classList.remove('app-dialog-overlay--show');
      setTimeout(() => overlay.remove(), 180);
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
      resolve(result);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      else if (e.key === 'Tab') {
        // Keep keyboard focus inside the dialog's two buttons.
        const btns = overlay.querySelectorAll('button');
        const first = btns[0], last = btns[btns.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    overlay.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act) close(act === 'ok');
      else if (e.target === overlay) close(false);
    });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('app-dialog-overlay--show'));
    overlay.querySelector(danger ? '[data-act="cancel"]' : '[data-act="ok"]').focus();
  });
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

// Booking-details modal placeholder: a header row, a map block, then a few
// label/value lines — the same rhythm as the real details view.
function skeletonDetails() {
  const line = (w) => `<div class="skeleton skeleton-line skeleton-line--${w}"></div>`;
  return `
    <div class="skeleton-details" aria-busy="true" aria-label="Loading">
      <div class="skeleton-card" style="border:0;padding:0;margin-bottom:18px">
        <div class="skeleton skeleton-avatar"></div>
        <div class="skeleton-body">${line('w60')}${line('w40')}</div>
      </div>
      <div class="skeleton skeleton-block"></div>
      ${['w80', 'w60', 'w80', 'w40', 'w60'].map(line).join('')}
    </div>`;
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
// "Today, 8:42 AM" / "Yesterday, 3:10 PM" / "Tomorrow, 9:00 AM" / "Oct 12, 3:10 AM";
// the year is only shown when it isn't this year.
function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  const now = new Date();
  const time = d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
  const dayDiff = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 86400000);
  if (dayDiff === 0) return 'Today, ' + time;
  if (dayDiff === 1) return 'Yesterday, ' + time;
  if (dayDiff === -1) return 'Tomorrow, ' + time;
  const date = d.toLocaleDateString('en-PH', d.getFullYear() === now.getFullYear()
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
  return date + ', ' + time;
}
// Only http(s) image URLs are rendered — anything else (javascript:, data:)
// falls back to the icon tile.
function safeImageUrl(url) {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
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
    expired: 'badge--expired', no_show: 'badge--no-show',
    approved: 'badge--completed', rejected: 'badge--cancelled'
  };
  const label = { no_show: 'No-show' }[status] || status;
  return `<span class="badge ${map[status] || 'badge--pending'}">${label}</span>`;
}

/* ── Philippine field formatting + validation ─────────────────────────────
   Shared by every form that takes one of these fields — registration, the
   profile forms, and the parcel sender/receiver details — so the input
   masks and the submit-time checks can never drift apart. Each field has:
     format*  → live display value (e.g. "0917 123 4567")
     normalize* → the value to store in the database
     isValid* → boolean check to run again before submitting
   ------------------------------------------------------------------------- */

// Mobile number — 09XX XXX XXXX (11 digits, must start with 09). Stored as
// bare digits: "09171234567".
function formatPhoneMobile(v) {
  let d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d && d[0] !== '0') d = '0' + d;           // tolerate a pasted "9171234567"
  d = d.slice(0, 11);
  return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 11)].filter(Boolean).join(' ');
}
function normalizePhoneMobile(v) {
  return String(v == null ? '' : v).replace(/\D/g, '').slice(0, 11);
}
function isValidPhoneMobile(v) {
  return /^09\d{9}$/.test(normalizePhoneMobile(v));
}

// Vehicle plate — ABC 1234 (3 letters + 4 digits, uppercase). Stored spaced
// and upper-cased: "ABC 1234".
function formatPlateNumber(v) {
  const s = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let letters = '', digits = '';
  for (const ch of s) {
    if (ch >= 'A' && ch <= 'Z' && letters.length < 3 && digits.length === 0) letters += ch;
    else if (ch >= '0' && ch <= '9' && letters.length > 0 && digits.length < 4) digits += ch;
  }
  return digits ? letters + ' ' + digits : letters;
}
function normalizePlateNumber(v) {
  return formatPlateNumber(v);
}
function isValidPlateNumber(v) {
  return /^[A-Z]{3} \d{3,4}$/.test(formatPlateNumber(v));
}

// Driver's licence — N12-34-567890 (1 letter + 2 + 2 + 6 digits, uppercase).
// Stored with hyphens exactly as shown.
function formatLicenseNumber(v) {
  const s = String(v == null ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
  let sig = '';
  for (const ch of s) {
    if (sig.length === 0) { if (ch >= 'A' && ch <= 'Z') sig += ch; }
    else if (sig.length < 11 && ch >= '0' && ch <= '9') sig += ch;
  }
  let r = sig.slice(0, 3);
  if (sig.length > 3) r += '-' + sig.slice(3, 5);
  if (sig.length > 5) r += '-' + sig.slice(5);
  return r;
}
function normalizeLicenseNumber(v) {
  return formatLicenseNumber(v);
}
function isValidLicenseNumber(v) {
  return /^[A-Z]\d{2}-\d{2}-\d{6}$/.test(formatLicenseNumber(v));
}

// Person name — letters (any script), spaces, and . ' - only; single spaces;
// capped at 60. Not stored specially, just kept clean.
function formatName(v) {
  return String(v == null ? '' : v)
    .replace(/[^\p{L} .'-]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '')
    .slice(0, 60);
}
function isValidName(v) {
  const s = formatName(v).trim();
  return s.length >= 2 && /\p{L}/u.test(s);
}

// Wire a formatter onto an <input>: reformats as the user types, keeps the
// caret roughly where it was, and formats any value already in the field
// (e.g. a restored draft or a loaded profile). Safe to call more than once.
function attachInputMask(input, formatter) {
  if (!input || input.dataset.masked === '1') return;
  input.dataset.masked = '1';
  const reformat = () => {
    const before = input.value;
    const fromEnd = before.length - (input.selectionStart == null ? before.length : input.selectionStart);
    const after = formatter(before);
    if (after !== before) {
      input.value = after;
      const pos = Math.max(0, after.length - fromEnd);
      try { input.setSelectionRange(pos, pos); } catch (_) { /* unsupported input type */ }
    }
  };
  input.addEventListener('input', reformat);
  input.addEventListener('blur', reformat);
  input.addEventListener('paste', () => setTimeout(reformat, 0));
  if (input.value) reformat();
  return reformat;
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

// ---- Booking kinds: ride (transport) / food / parcel / hauling ----------
// One place for each kind's label and address columns, so every dashboard
// renders a new kind the same way.
const KIND_LABEL = { transport: 'Ride', food: 'Food', parcel: 'Parcel', hauling: 'Hauling' };

function bookingPickup(b, kind) {
  return kind === 'parcel' ? b.sender_address : b.pickup_address;
}

function bookingDropoff(b, kind) {
  return { transport: b.destination_address, food: b.delivery_address, parcel: b.receiver_address, hauling: b.dropoff_address }[kind];
}

function bookingTitle(b, kind) {
  return kind === 'food'
    ? `${b.restaurant_name} → ${b.delivery_address}`
    : `${bookingPickup(b, kind)} → ${bookingDropoff(b, kind)}`;
}

const HAULING_CATEGORY_LABEL = {
  furniture: 'Furniture', appliances: 'Appliances', moving: 'House / office moving',
  construction: 'Construction materials', goods: 'Business goods / sacks', other: 'Other items',
};

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
  } catch (err) {
    console.warn(`Discarding a corrupt saved draft (${storageKey}):`, err && err.message);
    localStorage.removeItem(storageKey);
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
