/* iTULOD — shared dashboard helpers.
   Loaded before customer.js / rider.js on their dashboards. Holds the pieces
   that were copy-pasted between the two: booking-kind lookups, the avatar
   helpers, and the Profile tab form (identical on both dashboards).

   Page-specific things — TAB_TITLES, activateTab, the maps — stay in each
   dashboard's own file. */

const TABLE_BY_KIND = { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries', hauling: 'hauling_bookings' };
const ICON_BY_KIND = { transport: 'fa-car', food: 'fa-utensils', parcel: 'fa-box', hauling: 'fa-truck-moving' };
const COLOR_BY_KIND = { transport: 'var(--blue)', food: 'var(--orange)', parcel: 'var(--green)', hauling: 'var(--blue-dark)' };

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

// Sets el's contents to the avatar image, preserving a `.overlay` child if
// one is already there (the clickable upload preview has one for its
// hover-camera hint; the plain sidebar avatar badge doesn't).
function setAvatarImg(el, url) {
  const overlay = el.querySelector('.overlay');
  el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
  if (overlay) el.appendChild(overlay);
}

function refreshSideAvatar() {
  renderAccountMenus(CURRENT_PROFILE); // the profile picture menu at the top
  const el = document.getElementById('side-avatar');
  if (!el) return;
  if (CURRENT_PROFILE.avatar_url) setAvatarImg(el, CURRENT_PROFILE.avatar_url);
  else el.textContent = initials(CURRENT_PROFILE.full_name);
}

// ---- Profile tab -------------------------------------------------------------
function populateProfileForm() {
  document.getElementById('profile-name').value = CURRENT_PROFILE.full_name || '';
  document.getElementById('profile-phone').value = formatPhoneMobile(CURRENT_PROFILE.phone || '');
  document.getElementById('profile-email').value = CURRENT_PROFILE.email || '';
  const preview = document.getElementById('profile-avatar-preview');
  if (CURRENT_PROFILE.avatar_url) setAvatarImg(preview, CURRENT_PROFILE.avatar_url);
  else preview.textContent = initials(CURRENT_PROFILE.full_name);
  renderAvatarPending();
}

// An approved rider's new photo waits for the admin (sql/030) — say so under
// the photo until it's approved or turned down.
function renderAvatarPending() {
  const info = document.getElementById('profile-avatar-filename')?.parentElement;
  if (!info) return;
  let note = document.getElementById('profile-avatar-pending');
  if (!CURRENT_PROFILE?.avatar_pending_url) { note?.remove(); return; }
  if (!note) {
    note = document.createElement('p');
    note.id = 'profile-avatar-pending';
    note.className = 'avatar-pending-note';
    info.appendChild(note);
  }
  note.innerHTML = '<i class="fa-solid fa-hourglass-half"></i> Your new photo is waiting for admin approval. Customers still see your current photo.';
}

// Instant feedback the moment a photo is picked, before it's ever uploaded:
// shows it in the round preview and its filename next to the button. Wired
// once per page (attachInputMask-style dataset guard) since wireProfileForm
// can in principle run more than once.
function wireAvatarPicker() {
  const input = document.getElementById('profile-avatar-file');
  if (!input || input.dataset.wired === '1') return;
  input.dataset.wired = '1';
  const preview = document.getElementById('profile-avatar-preview');
  const nameEl = document.getElementById('profile-avatar-filename');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const problem = photoPickProblem(file);
    if (problem) {
      toast(problem, 'error');
      input.value = '';
      return;
    }
    if (nameEl) nameEl.textContent = file.name;
    const reader = new FileReader();
    reader.onload = (e) => setAvatarImg(preview, e.target.result);
    reader.readAsDataURL(file);
  });
}

function wireProfileForm() {
  attachInputMask(document.getElementById('profile-name'), formatName);
  attachInputMask(document.getElementById('profile-phone'), formatPhoneMobile);
  wireAvatarPicker();
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profile-submit');
    const full_name = document.getElementById('profile-name').value.trim();
    const phone = normalizePhoneMobile(document.getElementById('profile-phone').value);
    if (!requireFields({ 'Full name': full_name })) return;
    if (!isValidName(full_name)) {
      toast('Please enter your name using letters only.', 'error');
      return;
    }
    if (phone && !isValidPhoneMobile(phone)) {
      toast('Please enter a valid mobile number (09XX XXX XXXX).', 'error');
      return;
    }

    setLoading(btn, true);
    let avatar_url = CURRENT_PROFILE.avatar_url;
    const fileInput = document.getElementById('profile-avatar-file');
    const file = fileInput.files[0];
    let uploadFailed = false;
    if (file) {
      try {
        avatar_url = await uploadAvatarFile(CURRENT_PROFILE.id, file);
      } catch (upErr) {
        console.error('Avatar upload failed:', upErr?.message || upErr);
        uploadFailed = true;
      }
    }

    const { data: saved, error } = await supabase.from('profiles')
      .update({ full_name, phone, avatar_url })
      .eq('id', CURRENT_PROFILE.id)
      .select('avatar_url, avatar_pending_url')
      .single();
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    // An approved rider's new photo is held for admin review: the database
    // keeps the current photo and puts the new one in avatar_pending_url.
    const sentForReview = !!file && !uploadFailed && saved?.avatar_pending_url === avatar_url;
    CURRENT_PROFILE.full_name = full_name; CURRENT_PROFILE.phone = phone;
    CURRENT_PROFILE.avatar_url = saved ? saved.avatar_url : avatar_url;
    CURRENT_PROFILE.avatar_pending_url = saved ? saved.avatar_pending_url : null;
    fileInput.value = '';
    const nameEl = document.getElementById('profile-avatar-filename');
    if (nameEl) nameEl.textContent = 'No file chosen';
    refreshSideAvatar();
    populateProfileForm();
    if (uploadFailed) toast('Profile saved, but the photo upload failed — try again later.', 'info');
    else if (sentForReview) toast('Profile saved. Your new photo was sent to the admin for approval — customers see your current photo until then.', 'info');
    else toast('Profile updated!', 'success');
  });
}

// Asks for the current password first, so someone holding an unlocked
// phone or a logged-in laptop can't change it. The check is a fresh sign-in
// with that password for the same account (app: profile_screen.dart).
function wireChangePasswordForm() {
  const form = document.getElementById('change-password-form');
  if (!form) return;
  attachPasswordChecklist(document.getElementById('new-password'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('change-password-submit');
    const current = document.getElementById('current-password').value;
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    if (!requireFields({ 'Current password': current, 'New password': password, 'Confirm new password': confirm })) return;
    if (passwordProblem(password)) { toast(passwordProblem(password), 'error'); return; }
    if (password !== confirm) { toast('Those passwords don’t match.', 'error'); return; }
    if (password === current) { toast('Choose a password different from your current one.', 'error'); return; }

    setLoading(btn, true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error: checkError } = await supabase.auth.signInWithPassword({ email: user?.email || '', password: current });
    if (checkError) {
      setLoading(btn, false);
      toast('Your current password is incorrect.', 'error');
      return;
    }
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    form.reset();
    toast('Password updated.', 'success');
  });
}

// ---- automatic booking expiration ----------------------------------------
// The real sweep runs server-side (sql/009_booking_expiration.sql's
// expire_stale_bookings(), on a schedule via pg_cron or the expire-bookings
// Edge Function) so it happens even with nobody looking at the app. This is
// just a background nudge: whenever a dashboard is open, ping the same
// function so a stale booking flips to "Expired" within seconds rather than
// waiting for the next scheduled tick. The realtime subscription each
// dashboard already has picks up the resulting row change and re-renders it
// — this never needs to touch the UI directly.
const BOOKING_EXPIRY_CHECK_MS = 60 * 1000;
function startBookingExpiryWatch() {
  const tick = () => {
    supabase.rpc('expire_stale_bookings').then(({ error }) => {
      if (error) console.warn('expire_stale_bookings check failed:', error.message);
    });
  };
  tick();
  setInterval(tick, BOOKING_EXPIRY_CHECK_MS);
}

// ---- Profile sync across devices --------------------------------------------
// The same account can be open on the web and the mobile app at once. When the
// profile changes on either (name, phone, photo, a rider's capital on hand),
// realtime pushes the new row here (sql/029 adds profiles to the realtime
// publication). A re-read when the tab comes back into view covers anything
// missed while the phone/laptop was asleep.
function applyProfileUpdate(p) {
  if (!p || !CURRENT_PROFILE || p.id !== CURRENT_PROFILE.id) return;
  const floatChanged = Number(p.float_amount ?? 0) !== Number(CURRENT_PROFILE.float_amount ?? 0);
  Object.assign(CURRENT_PROFILE, p);

  const sideName = document.getElementById('side-name');
  if (sideName) sideName.textContent = p.full_name || '';
  refreshSideAvatar();

  // Profile form — leave a field alone while the user is typing in it.
  const setIfIdle = (id, value) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = value;
  };
  setIfIdle('profile-name', p.full_name || '');
  setIfIdle('profile-phone', formatPhoneMobile(p.phone || ''));
  const preview = document.getElementById('profile-avatar-preview');
  const picked = document.getElementById('profile-avatar-file')?.files?.length;
  if (preview && !picked) {
    if (p.avatar_url) setAvatarImg(preview, p.avatar_url);
    else preview.textContent = initials(p.full_name);
  }
  renderAvatarPending();

  // Rider: capital on hand (float) card + the "more than your float" warnings.
  if (floatChanged) {
    const floatEl = document.getElementById('home-float-amount');
    if (floatEl) floatEl.textContent = peso(p.float_amount || 0);
    setIfIdle('float-input', p.float_amount || '');
    if (typeof loadRequests === 'function') loadRequests();
  }
}

let _profileSyncStarted = false;
function startProfileSync() {
  if (_profileSyncStarted || !CURRENT_PROFILE?.id) return;
  _profileSyncStarted = true;
  supabase.channel(`profile-sync-${CURRENT_PROFILE.id}`)
    .on('postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${CURRENT_PROFILE.id}` },
      ({ new: p }) => applyProfileUpdate(p))
    .subscribe();
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    const { data } = await supabase.from('profiles').select('*').eq('id', CURRENT_PROFILE.id).single();
    if (data) applyProfileUpdate(data);
  });
}

// ---- Notifications (customer + rider) ---------------------------------------
// Unread count on every .js-notif-count badge (sidebar, phone top bar, nav).
function setNotifCount(unread) {
  window.ITULOD_UNREAD = unread; // the profile menu's Notifications row reads this when it re-renders
  document.querySelectorAll('.js-notif-dot').forEach((d) => { d.hidden = !(unread > 0); });
  document.querySelectorAll('.js-notif-count').forEach(el => {
    el.textContent = unread;
    el.style.display = unread > 0 ? 'inline-block' : 'none';
  });
}

// ---- notifications ----------------------------------------------------------
// Each notification stays unread until the customer opens it; opening one
// marks just that one read and shows it in full (the app does the same).
let NOTIFS = [];

async function loadNotifications() {
  const list = document.getElementById('notif-list');
  showSkeleton(list, skeletonList(3));
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', CURRENT_PROFILE.id).order('created_at', { ascending: false }).limit(30);
  if (error || !data || data.length === 0) {
    list.innerHTML = error
      ? emptyState({
          icon: 'fa-triangle-exclamation',
          title: 'Could not load notifications',
          body: error.message,
          tone: 'error'
        })
      : emptyState({
          icon: 'fa-bell-slash',
          title: 'No notifications yet',
          body: CURRENT_PROFILE?.role === 'rider'
            ? "We'll let you know here about your jobs, tips and your account."
            : "We'll let you know here when there's an update on a booking."
        });
    NOTIFS = [];
    setNotifCount(0);
    syncNotifMarkAll();
    return;
  }
  NOTIFS = data;
  setNotifCount(data.filter(n => !n.is_read).length);
  syncNotifMarkAll();

  list.innerHTML = data.map(n => `
    <div class="notif-item ${n.is_read ? 'read' : ''}" data-id="${n.id}" role="button" tabindex="0"
         aria-label="${escapeHtml(n.title)}${n.is_read ? '' : ' (unread)'}"
         onclick="openNotification('${n.id}')"
         onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openNotification('${n.id}')}">
      <div class="notif-icon"><i class="fa-solid ${notifIcon(n)}"></i></div>
      <div class="notif-text">
        <h4>${escapeHtml(n.title)}</h4>
        <p>${escapeHtml(n.message)}</p>
        <time>${formatDate(n.created_at)}</time>
      </div>
      <span class="dot" aria-hidden="true"></span>
    </div>`).join('');
}

function syncNotifMarkAll() {
  const btn = document.getElementById('notif-mark-all');
  if (btn) btn.style.display = NOTIFS.some(n => !n.is_read) ? '' : 'none';
}

// Booking updates get a shortcut to Booking history in the details.
const NOTIF_BOOKING_RE = /\b(ride|delivery|hauling|booking|rider|trip|parcel|food|payment|refund|fee|cod|tip|no-show|expired|cancell?ed)\b/i;

function notifIcon(n) {
  const t = `${n.title} ${n.message}`.toLowerCase();
  if (/refund|wallet|payment|fee|tip|bonus/.test(t)) return 'fa-wallet';
  if (/cancel|expired|no-show|not approved/.test(t)) return 'fa-circle-exclamation';
  if (/completed|approved|accepted/.test(t)) return 'fa-circle-check';
  return 'fa-bell';
}

async function openNotification(id) {
  const n = NOTIFS.find(x => x.id === id);
  if (!n) return;
  const when = new Date(n.created_at);
  const fullDate = isNaN(when) ? '' : when.toLocaleString('en-PH', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const bookingRelated = NOTIF_BOOKING_RE.test(`${n.title} ${n.message}`);
  document.getElementById('notif-modal-body').innerHTML = `
    <div class="notif-detail">
      <div class="notif-detail__icon"><i class="fa-solid ${notifIcon(n)}"></i></div>
      <h4 id="notif-modal-title">${escapeHtml(n.title)}</h4>
      <time datetime="${escapeHtml(n.created_at || '')}"><i class="fa-regular fa-clock"></i> ${escapeHtml(fullDate)}</time>
      <p>${escapeHtml(n.message)}</p>
      <div class="notif-detail__actions">
        ${bookingRelated ? `<button type="button" class="btn btn-primary btn-block" onclick="closeNotification(); activateTab('history')"><i class="fa-solid fa-clock-rotate-left"></i> ${CURRENT_PROFILE?.role === 'rider' ? 'View history' : 'View booking history'}</button>` : ''}
        <button type="button" class="btn btn-outline btn-block" onclick="closeNotification()">Close</button>
      </div>
    </div>`;
  document.getElementById('notif-modal').classList.add('open');

  if (n.is_read) return;
  // Mark just this one read — right away on screen, then in the database.
  n.is_read = true;
  document.querySelector(`.notif-item[data-id="${id}"]`)?.classList.add('read');
  setNotifCount(NOTIFS.filter(x => !x.is_read).length);
  syncNotifMarkAll();
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  if (error) console.warn('Could not mark notification read:', error.message);
}

function closeNotification() {
  document.getElementById('notif-modal')?.classList.remove('open');
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.getElementById('notif-modal')?.classList.contains('open')) closeNotification();
});

async function markAllNotificationsRead() {
  const btn = document.getElementById('notif-mark-all');
  if (btn) setLoading(btn, true);
  const { error } = await supabase.from('notifications').update({ is_read: true })
    .eq('user_id', CURRENT_PROFILE.id).eq('is_read', false);
  if (btn) setLoading(btn, false);
  if (error) { toast(error.message, 'error'); return; }
  NOTIFS.forEach(n => { n.is_read = true; });
  document.querySelectorAll('.notif-item').forEach(el => el.classList.add('read'));
  setNotifCount(0);
  syncNotifMarkAll();
  toast('All notifications marked as read.', 'success');
}

// Live: refresh the list when a notification arrives or changes.
let _notifWatchStarted = false;
function watchNotifications() {
  if (_notifWatchStarted || !CURRENT_PROFILE?.id) return;
  _notifWatchStarted = true;
  supabase.channel(`notifications-${CURRENT_PROFILE.id}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${CURRENT_PROFILE.id}` }, () => loadNotifications())
    .subscribe();
}
