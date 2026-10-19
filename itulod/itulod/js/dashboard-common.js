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
}

const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5MB — matches the hint text under the button

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
    if (!file.type.startsWith('image/')) {
      toast('Please choose an image file.', 'error');
      input.value = '';
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast('That image is too large — please choose one under 5MB.', 'error');
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
    const file = document.getElementById('profile-avatar-file').files[0];
    if (file) {
      const path = `${CURRENT_PROFILE.id}/avatar-${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) {
        console.error('Avatar upload failed:', upErr.message);
        toast('Profile saved, but the photo upload failed — try again later.', 'info');
      } else {
        avatar_url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
      }
    }

    const { error } = await supabase.from('profiles').update({ full_name, phone, avatar_url }).eq('id', CURRENT_PROFILE.id);
    setLoading(btn, false);
    if (error) { toast(error.message, 'error'); return; }
    CURRENT_PROFILE.full_name = full_name; CURRENT_PROFILE.phone = phone; CURRENT_PROFILE.avatar_url = avatar_url;
    document.getElementById('side-name').textContent = full_name;
    refreshSideAvatar();
    toast('Profile updated!', 'success');
  });
}

// A logged-in session is enough authorization to change your own password —
// Supabase Auth updates whoever the current access token belongs to, so
// there's no separate "current password" check to do here.
function wireChangePasswordForm() {
  const form = document.getElementById('change-password-form');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('change-password-submit');
    const password = document.getElementById('new-password').value;
    const confirm = document.getElementById('confirm-password').value;
    if (!requireFields({ 'New password': password, 'Confirm new password': confirm })) return;
    if (password.length < 8) { toast('Use at least 8 characters.', 'error'); return; }
    if (password !== confirm) { toast('Those passwords don’t match.', 'error'); return; }

    setLoading(btn, true);
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
