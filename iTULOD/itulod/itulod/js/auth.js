/**
 * iTULOD — authentication
 * Handles: username/email login, role-based registration (customer /
 * rider), rider document upload to Storage, password reset,
 * and redirecting an already-logged-in visitor to the right dashboard.
 */

function resolveLoginEmail(identifier) {
  const value = identifier.trim();
  if (value.toLowerCase() === CONFIG.ADMIN_USERNAME) return CONFIG.ADMIN_EMAIL;
  return value;
}

function isAdminUsername(identifier) {
  return identifier.trim().toLowerCase() === CONFIG.ADMIN_USERNAME;
}

function updatePasswordMasking() {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  if (!usernameInput || !passwordInput) return;
  const showPlain = isAdminUsername(usernameInput.value);
  passwordInput.type = showPlain ? 'text' : 'password';
}

// Redirect already-logged-in users to their dashboard.
(async function redirectIfLoggedIn() {
  // Only run on login/register pages
  if (!window.location.pathname.match(/(login|register)\.html/)) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { data: profile } = await supabase.from('profiles').select('role, is_active').eq('id', session.user.id).single();
  if (profile?.is_active) {
    const approval = await ensureRiderApproval(profile);
    if (approval.allowed) window.location.href = redirectForRole(profile.role);
  }
})();

// ---------------------------------------------------------------------
// LOGIN
// ---------------------------------------------------------------------
document.getElementById('username')?.addEventListener('input', updatePasswordMasking);
updatePasswordMasking();

document.getElementById('login-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const email = resolveLoginEmail(username);

  if (!requireFields({ 'Username': username, 'Password': password })) return;

  setLoading(btn, true);

  let signInDone = false;
  const timeout = setTimeout(() => {
    if (!signInDone) {
      setLoading(btn, false);
      toast('Request timed out. Check your internet connection or Supabase URL/key.', 'error');
    }
  }, 8000);

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  signInDone = true;
  clearTimeout(timeout);
  setLoading(btn, false);

  if (error) {
    toast(error.message, 'error');
    return;
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles').select('role, is_active').eq('id', data.user.id).single();

  if (profileErr || !profile) {
    toast('Profile error: ' + (profileErr?.message || 'No profile row found — re-run the seed SQL.'), 'error');
    return;
  }
  if (!profile.is_active) {
    toast('This account has been deactivated. Contact support.', 'error');
    await supabase.auth.signOut();
    return;
  }

  const approval = await ensureRiderApproval(profile);
  if (!approval.allowed) {
    toast(approval.message, 'info');
    await supabase.auth.signOut();
    return;
  }

  toast('Welcome back!', 'success');
  setTimeout(() => window.location.href = redirectForRole(profile.role), 500);
});

// forgot password
document.getElementById('forgot-link')?.addEventListener('click', async (e) => {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  if (!username) { toast('Enter your username above first, then click "Forgot password?"', 'info'); return; }
  if (isAdminUsername(username)) {
    toast('The default admin account cannot be reset here. Contact your system administrator.', 'info');
    return;
  }
  const email = resolveLoginEmail(username);
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/login.html'
  });
  if (error) toast(error.message, 'error');
  else toast('Password reset link sent to ' + email, 'success');
});

// ---------------------------------------------------------------------
// REGISTER
// ---------------------------------------------------------------------
const roleRadios = document.querySelectorAll('input[name="role"]');
roleRadios.forEach(r => r.addEventListener('change', toggleRoleFields));
function toggleRoleFields() {
  const role = document.querySelector('input[name="role"]:checked')?.value;
  const riderFields = document.getElementById('rider-fields');
  if (riderFields) riderFields.style.display = role === 'rider' ? 'block' : 'none';
}
toggleRoleFields();

// preselect role from ?role=rider query param (used by landing page links)
(function preselectRoleFromQuery() {
  const role = new URLSearchParams(window.location.search).get('role');
  if (role) {
    const input = document.querySelector(`input[name="role"][value="${role}"]`);
    if (input) { input.checked = true; toggleRoleFields(); }
  }
})();

document.getElementById('register-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('register-btn');

  const role = document.querySelector('input[name="role"]:checked').value;
  const full_name = document.getElementById('full_name').value.trim();
  const phone = document.getElementById('phone').value.replace(/\s/g, '').trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const password2 = document.getElementById('password2').value;

  if (!requireFields({ 'Full name': full_name, 'Phone number': phone, 'Email': email, 'Password': password })) return;
  if (password !== password2) { toast('Passwords do not match.', 'error'); return; }
  if (!document.getElementById('terms').checked) { toast('Please accept the Terms of Service.', 'error'); return; }

  setLoading(btn, true);

  // 1. create the auth user; the on_auth_user_created trigger creates the profile row
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { full_name, role } }
  });

  if (error) {
    setLoading(btn, false);
    toast(error.message, 'error');
    return;
  }

  const userId = data.user?.id;

  // 2. save phone number onto the auto-created profile row
  if (userId) {
    await supabase.from('profiles').update({ phone }).eq('id', userId);
  }

  // 3. rider signups also submit a rider_application + upload documents
  if (role === 'rider' && userId) {
    const vehicle_type = document.getElementById('vehicle_type').value;
    const license_number = document.getElementById('license_number').value.trim();
    const vehicle_plate = document.getElementById('vehicle_plate').value.trim();
    const licenseFile = document.getElementById('license_file').files[0];
    const orcrFile = document.getElementById('orcr_file').files[0];

    let license_url = null, or_cr_url = null;
    try {
      if (licenseFile) license_url = await uploadRiderDoc(userId, licenseFile, 'license');
      if (orcrFile) or_cr_url = await uploadRiderDoc(userId, orcrFile, 'orcr');
    } catch (uploadErr) {
      toast('Account created, but document upload failed — you can upload it later from your profile.', 'info');
    }

    await supabase.from('rider_applications').insert({
      rider_id: userId, vehicle_type, license_number, vehicle_plate, license_url, or_cr_url, status: 'pending'
    });
  }

  setLoading(btn, false);

  const needsEmailConfirm = !data.session;
  toast(
    needsEmailConfirm
      ? 'Account created! Check your email to verify before logging in.'
      : (role === 'rider' ? 'Account created! Your rider application is pending admin approval.' : 'Account created!'),
    'success'
  );

  setTimeout(() => window.location.href = 'login.html', 1200);
});

async function uploadRiderDoc(userId, file, kind) {
  const path = `${userId}/${kind}-${Date.now()}-${file.name}`;
  const { error } = await supabase.storage.from('rider-documents').upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('rider-documents').getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------
// LOGOUT — used by the sidebar on every dashboard page
// ---------------------------------------------------------------------
async function logout() {
  await supabase.auth.signOut();
  window.location.href = rootPath() + 'index.html';
}
