/* iTULOD — shared dashboard helpers.
   Loaded before customer.js / rider.js on their dashboards. Holds the pieces
   that were copy-pasted between the two: booking-kind lookups, the avatar
   helpers, and the Profile tab form (identical on both dashboards).

   Page-specific things — TAB_TITLES, activateTab, the maps — stay in each
   dashboard's own file. */

const TABLE_BY_KIND = { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries' };
const ICON_BY_KIND = { transport: 'fa-car', food: 'fa-utensils', parcel: 'fa-box' };
const COLOR_BY_KIND = { transport: 'var(--blue)', food: 'var(--orange)', parcel: 'var(--green)' };

function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
}

function setAvatarImg(el, url) {
  el.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
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

function wireProfileForm() {
  attachInputMask(document.getElementById('profile-phone'), formatPhoneMobile);
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('profile-submit');
    const full_name = document.getElementById('profile-name').value.trim();
    const phone = normalizePhoneMobile(document.getElementById('profile-phone').value);
    if (!requireFields({ 'Full name': full_name })) return;
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
    toast('Profile updated!', 'success');
  });
}
