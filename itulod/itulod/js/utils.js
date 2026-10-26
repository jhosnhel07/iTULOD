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
// ---- Success moment -------------------------------------------------------
// A short animated check for the big wins (booking placed, trip completed).
// Closes on its own, on tap or on Esc; reduced-motion users get no animation.
function celebrate(title, message = '') {
  document.querySelector('.celebrate')?.remove();
  const el = document.createElement('div');
  el.className = 'celebrate';
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `
    <div class="celebrate__card">
      <svg class="celebrate__check" viewBox="0 0 52 52" aria-hidden="true">
        <circle class="celebrate__ring" cx="26" cy="26" r="24" fill="none"/>
        <path class="celebrate__tick" fill="none" d="M15 27l7 7 15-16"/>
      </svg>
      <strong class="celebrate__title">${escapeHtml(title)}</strong>
      ${message ? `<p class="celebrate__msg">${escapeHtml(message)}</p>` : ''}
      <button type="button" class="btn btn-primary btn-sm celebrate__ok">OK</button>
    </div>`;
  document.body.appendChild(el);
  const close = () => {
    document.removeEventListener('keydown', onKey);
    el.classList.remove('celebrate--show');
    setTimeout(() => el.remove(), 220);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('.celebrate__ok')) close(); });
  requestAnimationFrame(() => el.classList.add('celebrate--show'));
  setTimeout(close, message ? 5200 : 3200);
}

function toastIcon(type) {
  return { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' }[type] || 'fa-circle-info';
}

// ---- Light / dark theme ---------------------------------------------------
// Light is the default. A tap on any .js-theme-toggle saves 'light' or 'dark'
// on this device. The saved choice is applied before
// first paint by a small inline script in each dashboard's <head>.
const THEME_KEY = 'itulod-theme';
function currentTheme() {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return 'light';
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
  document.querySelectorAll('.account-pop [data-acct="theme"]').forEach((row) => {
    row.setAttribute('aria-checked', String(dark));
  });
}

// ---- Account menu (dashboards) ------------------------------------------
// The profile picture at the top of each dashboard (where the sun/moon
// button used to be). Opens a menu with the name and email, "My profile",
// the dark-mode switch and Log out. Call again whenever the profile changes.
const ROLE_LABEL = { customer: 'Customer', rider: 'Rider', admin: 'Admin' };
function renderAccountMenus(profile) {
  if (!profile) return;
  const name = profile.full_name || 'My account';
  const initialsOf = (n) => (n || '?').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const face = (cls) => profile.avatar_url
    ? `<span class="${cls}"><img src="${escapeHtml(profile.avatar_url)}" alt=""></span>`
    : `<span class="${cls}">${escapeHtml(initialsOf(name))}</span>`;
  const hasProfileTab = !!document.getElementById('tab-profile');
  const hasNotifTab = !!document.getElementById('tab-notifications');
  const unread = Number(window.ITULOD_UNREAD || 0);
  document.querySelectorAll('.js-account-menu').forEach((host) => {
    const wasOpen = host.classList.contains('is-open');
    host.innerHTML = `
      <button type="button" class="account-who" tabindex="-1" aria-hidden="true">
        <strong>${escapeHtml(name)}</strong><span>${escapeHtml(profile.email || '')}</span>
      </button>
      <button type="button" class="account-btn" aria-haspopup="menu" aria-expanded="${wasOpen}" aria-label="Account menu for ${escapeHtml(name)}">
        ${face('account-avatar')}
        ${hasNotifTab ? `<span class="account-dot js-notif-dot" ${unread > 0 ? '' : 'hidden'}></span>` : ''}
      </button>
      <div class="account-pop" role="menu" ${wasOpen ? '' : 'hidden'}>
        <div class="account-pop__head">
          ${face('account-avatar account-avatar--lg')}
          <div class="account-pop__who">
            <strong>${escapeHtml(name)}</strong>
            <span>${escapeHtml(profile.email || '')}</span>
            ${ROLE_LABEL[profile.role] ? `<span class="badge badge--role-${profile.role} role-tag">${ROLE_LABEL[profile.role]}</span>` : ''}
          </div>
        </div>
        ${hasProfileTab ? '<button type="button" role="menuitem" data-acct="profile"><i class="fa-solid fa-user"></i><span>My profile</span></button>' : ''}
        ${hasNotifTab ? `<button type="button" role="menuitem" data-acct="notifications"><i class="fa-solid fa-bell"></i><span>Notifications</span><span class="badge badge--danger js-notif-count account-count" style="display:${unread > 0 ? 'inline-block' : 'none'}">${unread}</span></button>` : ''}
        <button type="button" role="menuitemcheckbox" aria-checked="${currentTheme() === 'dark'}" data-acct="theme">
          <i class="fa-solid fa-moon"></i><span>Dark mode</span><span class="account-switch" aria-hidden="true"></span>
        </button>
        <button type="button" role="menuitem" data-acct="logout" class="is-danger"><i class="fa-solid fa-right-from-bracket"></i><span>Log out</span></button>
      </div>`;
    if (host.dataset.wired) return;
    host.dataset.wired = '1';
    host.addEventListener('click', (e) => {
      if (e.target.closest('.account-btn, .account-who')) { setAccountMenuOpen(host, !host.classList.contains('is-open')); return; }
      const item = e.target.closest('[data-acct]');
      if (!item) return;
      const act = item.dataset.acct;
      if (act === 'theme') { toggleTheme(); return; } // stays open so the switch can be seen flipping
      setAccountMenuOpen(host, false);
      if (act === 'profile' && typeof activateTab === 'function') activateTab('profile');
      if (act === 'notifications' && typeof activateTab === 'function') activateTab('notifications');
      if (act === 'logout' && typeof logout === 'function') logout();
    });
  });
}
function setAccountMenuOpen(host, open) {
  document.querySelectorAll('.js-account-menu.is-open').forEach((h) => { if (h !== host) setAccountMenuOpen(h, false); });
  host.classList.toggle('is-open', open);
  host.querySelector('.account-btn')?.setAttribute('aria-expanded', String(open));
  const pop = host.querySelector('.account-pop');
  if (pop) pop.hidden = !open;
}
document.addEventListener('click', (e) => {
  document.querySelectorAll('.js-account-menu.is-open').forEach((h) => { if (!h.contains(e.target)) setAccountMenuOpen(h, false); });
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  document.querySelectorAll('.js-account-menu.is-open').forEach((h) => {
    setAccountMenuOpen(h, false);
    h.querySelector('.account-btn')?.focus();
  });
});
function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem(THEME_KEY, next); } catch (_) { /* private mode: applies for this visit only */ }
  syncThemeToggles();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncThemeToggles);
else syncThemeToggles();

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

// Sample dish photos (CC0 / public domain) live in catalog-images/stock
// (sql/027, sql/028, STOCK_PHOTOS.md); the apps tag them "Sample photo" so
// customers know it isn't the restaurant's own picture.
const STOCK_PHOTO_BASE = `${CONFIG.SUPABASE_URL}/storage/v1/object/public/catalog-images/stock/`;
function isSamplePhoto(url) {
  return typeof url === 'string' && url.includes('/catalog-images/stock/');
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
// ---- Vehicle services --------------------------------------------------------
// Which services a vehicle can be booked for (vehicles.services, sql/040).
// Falls back to the older vehicles.service split for rows from before 040.
const SERVICE_ORDER = ['ride', 'food', 'parcel', 'hauling'];
const SERVICE_LABELS = { ride: 'Ride', food: 'Food', parcel: 'Parcel', hauling: 'Hauling' };
function vehicleServices(v) {
  const s = Array.isArray(v?.services) && v.services.length
    ? v.services
    : (v?.service === 'hauling' ? ['hauling'] : ['ride', 'food', 'parcel']);
  return SERVICE_ORDER.filter((x) => s.includes(x));
}
function vehicleAllows(v, service) { return vehicleServices(v).includes(service); }
function vehicleServicesText(v) {
  const s = vehicleServices(v);
  return s.length === 1 ? SERVICE_LABELS[s[0]] + ' only' : s.map((x) => SERVICE_LABELS[x]).join(' · ');
}

// ---- Password rule --------------------------------------------------------
// Same rule on the web and the app (lib/core/utils/validators.dart), and
// Supabase Auth enforces it too: at least 8 characters with an uppercase
// letter, a lowercase letter, a number and a special character. The symbols
// are exactly the ones Supabase Auth counts as special.
const PASSWORD_SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: '1 uppercase letter (A–Z)', test: (p) => /[A-Z]/.test(p) },
  { label: '1 lowercase letter (a–z)', test: (p) => /[a-z]/.test(p) },
  { label: '1 number (0–9)', test: (p) => /[0-9]/.test(p) },
  { label: '1 special character (! @ # $ …)', test: (p) => [...p].some((c) => PASSWORD_SYMBOLS.includes(c)) },
];
// null when the password meets every rule, otherwise what's still missing.
function passwordProblem(pw) {
  const missing = PASSWORD_RULES.filter((r) => !r.test(String(pw || '')));
  if (!missing.length) return null;
  return 'Your password needs: ' + missing.map((r) => r.label.replace(/ \(.*\)$/, '').toLowerCase()).join(', ') + '.';
}
// Live checklist under a password input; ticks each rule as it's met.
function attachPasswordChecklist(input) {
  if (!input || input.dataset.pwRules) return;
  input.dataset.pwRules = '1';
  const list = document.createElement('ul');
  list.className = 'pw-rules';
  list.setAttribute('aria-live', 'polite');
  list.innerHTML = PASSWORD_RULES.map((r) => `<li><i class="fa-solid fa-circle-xmark"></i> ${r.label}</li>`).join('');
  (input.closest('.input-wrap') || input).insertAdjacentElement('afterend', list);
  const items = [...list.children];
  const update = () => {
    PASSWORD_RULES.forEach((r, i) => {
      const ok = r.test(input.value);
      items[i].classList.toggle('is-met', ok);
      items[i].querySelector('i').className = ok ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark';
    });
  };
  input.addEventListener('input', update);
  input.form?.addEventListener('reset', () => setTimeout(update, 0));
  update();
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

// ---- Ride fares + passengers (sql/044) ------------------------------------
// Rides use the vehicle's ride rates (Philippine fares): a minimum fare that
// covers the first ride_base_km, then a per-km rate; jeepney and bus charge
// per person, a tricycle adds a fee per extra passenger. Deliveries keep
// estimateFare() above. Same formula as public.vehicle_fare() in the DB.
function rideRates(v) {
  return {
    base: Number(v.ride_base_fare ?? v.base_fare ?? 0),
    perKm: Number(v.ride_per_km_rate ?? v.per_km_rate ?? 0),
    baseKm: Number(v.ride_base_km || 0),
    extra: Number(v.extra_passenger_fee || 0),
    perPerson: !!v.fare_per_passenger,
  };
}
function estimateRideFare(vehicle, distanceKm, passengers = 1) {
  if (!vehicle) return 0;
  const r = rideRates(vehicle);
  const pax = Math.max(1, Number(passengers) || 1);
  // one person's (or one vehicle's) fare, rounded to the centavo before multiplying
  const one = Math.round((r.base + r.perKm * Math.max(Number(distanceKm || 1) - r.baseKm, 0)) * 100) / 100;
  const total = r.perPerson ? one * pax : one + Math.max(pax - 1, 0) * r.extra;
  return Math.round(total * 100) / 100;
}
function rideFareBreakdown(vehicle, distanceKm, passengers = 1) {
  if (!vehicle) return '';
  const r = rideRates(vehicle);
  const pax = Math.max(1, Number(passengers) || 1);
  const km = Number(distanceKm || 1);
  const extraKm = Math.max(km - r.baseKm, 0);
  let s = peso(r.base) + (r.baseKm ? ` (first ${r.baseKm} km)` : ' base');
  if (extraKm > 0) s += ` + ${extraKm.toFixed(1)} km × ${peso(r.perKm)}`;
  if (r.perPerson) s += ` = ${peso(estimateRideFare(vehicle, km, 1))} per person × ${pax}`;
  else if (r.extra && pax > 1) s += ` + ${pax - 1} extra passenger${pax > 2 ? 's' : ''} × ${peso(r.extra)}`;
  return s;
}
function vehicleFitsPassengers(v, passengers) {
  const pax = Number(passengers) || 1;
  return pax >= Number(v.min_passengers || 1) && pax <= Number(v.max_passengers || v.capacity || 99);
}
function passengerRangeText(v) {
  const min = Number(v.min_passengers || 1), max = Number(v.max_passengers || v.capacity || min);
  return min === max ? `${min} passenger${min === 1 ? '' : 's'}` : `${min}–${max} passengers`;
}
// "👤 3 passengers" chip for a ride (rider cards, booking lists)
function passengersChip(b, kind) {
  if (kind !== 'transport') return '';
  const n = Number(b.passengers) || 1;
  return `<span class="pax-chip"><i class="fa-solid fa-user-group"></i> ${n} passenger${n === 1 ? '' : 's'}</span>`;
}
// "₱14 per person (first 4 km) + ₱2/km" — admin tables
function rideFareSummary(v) {
  const r = rideRates(v);
  let s = peso(r.base) + (r.perPerson ? ' per person' : '') + (r.baseKm ? ` (first ${r.baseKm} km)` : '') + ` + ${peso(r.perKm)}/km`;
  if (!r.perPerson && r.extra) s += ` · +${peso(r.extra)} per extra passenger`;
  return s;
}
function rideVehicleLabel(v) {
  const r = rideRates(v);
  return `${v.name} — ${passengerRangeText(v)} · ${r.perPerson ? peso(r.base) + '/person' : 'from ' + peso(r.base)}`;
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

// ---- Stay where you were after a refresh ---------------------------------
// The open section lives in the address (#book/parcel, #earnings) so a refresh
// — or logging in again after the session ran out — reopens it. Small choices
// inside a section (filters, the booking step, an open booking) are kept in
// sessionStorage: this browser tab only, gone when it closes or on log out.
const VIEW_PREFIX = 'itulod-view:';
const RETURN_KEY = 'itulod-return-to';
function readViewHash() {
  const [tab = '', sub = ''] = decodeURIComponent(location.hash.replace(/^#/, '')).split('/');
  return { tab, sub };
}
function writeViewHash(tab, sub) {
  const h = '#' + tab + (sub ? '/' + sub : '');
  if (location.hash !== h) history.replaceState(null, '', location.pathname + location.search + h);
}
function viewState(key, value) {
  const k = VIEW_PREFIX + location.pathname + ':' + key;
  try {
    if (value === undefined) { const raw = sessionStorage.getItem(k); return raw == null ? null : JSON.parse(raw); }
    if (value === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, JSON.stringify(value));
  } catch (_) { /* storage blocked: the page just opens as usual */ }
  return value;
}
// Everything above plus the booking drafts — on log out, so the next person
// on this browser starts clean.
function clearViewState() {
  try {
    for (const store of [sessionStorage, localStorage]) {
      Object.keys(store).filter(k => k.startsWith(VIEW_PREFIX) || k.startsWith('itulod-customer-') || k === RETURN_KEY)
        .forEach(k => store.removeItem(k));
    }
  } catch (_) { /* nothing to clear */ }
}
// Booking drafts used to live in localStorage (kept even after log out); they
// are per-tab now — drop any left over from before.
try { Object.keys(localStorage).filter(k => k.startsWith('itulod-customer-')).forEach(k => localStorage.removeItem(k)); } catch (_) { /* blocked */ }

// ---- Form draft persistence --------------------------------------------
// Kept in sessionStorage: survives a refresh, not closing the tab or log out.
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
  try { sessionStorage.setItem(storageKey, JSON.stringify(payload)); } catch (_) { /* storage blocked */ }
}

function restoreFormDraft(storageKey, form, extraKeys = {}) {
  if (!form) return null;
  try {
    const raw = sessionStorage.getItem(storageKey);
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
    try { sessionStorage.removeItem(storageKey); } catch (_) { /* blocked */ }
    return null;
  }
}

function clearFormDraft(storageKey) {
  try { sessionStorage.removeItem(storageKey); } catch (_) { /* blocked */ }
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
  // Back to the section you were on when the session ran out (requireSession).
  let hash = '';
  try {
    const back = JSON.parse(sessionStorage.getItem(RETURN_KEY) || 'null');
    sessionStorage.removeItem(RETURN_KEY);
    if (back && map[role] && back.path.endsWith(map[role]) && /^#[\w/-]+$/.test(back.hash)) hash = back.hash;
  } catch (_) { /* no saved place */ }
  return rootPath() + (map[role] || 'login.html') + hash;
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
    try { if (location.hash) sessionStorage.setItem(RETURN_KEY, JSON.stringify({ path: location.pathname, hash: location.hash })); } catch (_) { /* blocked */ }
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

// ---- Live vehicle count (landing, login and sign-up panels) -------------------
// Fills every [data-vehicle-count] with how many vehicle types can be booked
// right now, so the marketing copy never goes stale when the admin switches a
// category on or off. The number in the HTML stays if the call fails.
async function fillVehicleCount() {
  const els = document.querySelectorAll('[data-vehicle-count]');
  if (!els.length || typeof supabase === 'undefined') return;
  try {
    const { count, error } = await supabase.from('vehicles')
      .select('id', { count: 'exact', head: true }).eq('is_available', true);
    if (error || !count) return;
    els.forEach(el => { el.textContent = count; });
  } catch (_) { /* keep the built-in number */ }
}
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', fillVehicleCount);
}

// ---- Photo uploads -----------------------------------------------------------
// Shrinks a picked photo before upload so it goes up quickly on weak signal:
// longest side ≤ max px, re-encoded as JPEG. `square` centre-crops it first
// (profile photos show in a circle). Anything that isn't a still image — a
// PDF document, a GIF — or a browser that can't decode it is returned as is.
async function shrinkImageFile(file, { max = 1600, square = false, quality = 0.85 } = {}) {
  if (!file || !/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    let sx = 0, sy = 0, sw = bmp.width, sh = bmp.height;
    if (square) {
      const side = Math.min(sw, sh);
      sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side;
    }
    const scale = Math.min(1, max / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    canvas.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch (_) {
    return file;
  }
}

const MAX_PHOTO_PICK_BYTES = 15 * 1024 * 1024; // before shrinking — phone cameras

// Checks a photo the user just picked. Returns an error message, or null.
function photoPickProblem(file) {
  if (!file) return null;
  if (!file.type.startsWith('image/')) return 'Please choose a photo (JPG or PNG).';
  if (file.size > MAX_PHOTO_PICK_BYTES) return 'That photo is too large — please choose one under 15MB.';
  return null;
}

// Square, ≤512px profile photo → the public avatars bucket. Returns its URL.
async function uploadAvatarFile(userId, file) {
  const small = await shrinkImageFile(file, { max: 512, square: true });
  const path = `${userId}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('avatars')
    .upload(path, small, { upsert: true, contentType: small.type || 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}
