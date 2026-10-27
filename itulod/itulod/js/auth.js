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
  const { data: profile } = await supabase.from('profiles').select('id, role, is_active').eq('id', session.user.id).single();
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
    .from('profiles').select('id, role, is_active').eq('id', data.user.id).single();

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

// ---------------------------------------------------------------------
// FORGOT PASSWORD — email or mobile number → 6-digit code → new password →
// straight to the dashboard. The password-reset-code Edge Function finds the
// account (a number is looked up; the code always goes to the account's
// email), and checks the code, returning a session (sql/049).
// ---------------------------------------------------------------------
const FP = { identifier: '', resendTimer: null };

async function resetCodeCall(body) {
  const { data, error } = await supabase.functions.invoke('password-reset-code', { body });
  if (!error) return data;
  // non-2xx: the function's own message is in the response body
  let message = 'Something went wrong. Please try again.';
  try { message = (await error.context.json()).error || message; } catch (_) { /* network error */ }
  throw new Error(message);
}

function fpShowStep(n) {
  [1, 2, 3].forEach(i => { document.getElementById('fp-form-' + i).hidden = i !== n; });
  document.querySelectorAll('[data-fp-dot]').forEach(li => {
    const i = Number(li.dataset.fpDot);
    li.classList.toggle('is-current', i === n);
    li.classList.toggle('is-done', i < n);
  });
  const sub = document.getElementById('fp-sub');
  if (n === 1) sub.textContent = "Enter the email or mobile number on your account. We'll email you a 6-digit code.";
  if (n === 3) sub.textContent = 'Code accepted. Create your new password.';
  document.querySelector(`#fp-form-${n} input`)?.focus();
}

function fpOpen(open) {
  document.getElementById('login-form').hidden = open;
  document.getElementById('forgot-panel').hidden = !open;
  document.querySelector('.register-link')?.toggleAttribute('hidden', open);
  // the panel has its own heading
  document.querySelectorAll('.card-title, .card-sub').forEach(el => el.toggleAttribute('hidden', open));
  if (!open) return;
  // start with whatever they typed in the login box, when it's an email or number
  const typed = document.getElementById('username').value.trim();
  if (typed && !isAdminUsername(typed) && (typed.includes('@') || /^[\d\s+()-]{10,}$/.test(typed))) {
    document.getElementById('fp-identifier').value = typed;
  }
  fpShowStep(1);
}

function fpStartResendTimer() {
  const btn = document.getElementById('fp-resend');
  let left = 60;
  clearInterval(FP.resendTimer);
  btn.disabled = true;
  btn.textContent = `Resend code (${left}s)`;
  FP.resendTimer = setInterval(() => {
    left -= 1;
    if (left > 0) { btn.textContent = `Resend code (${left}s)`; return; }
    clearInterval(FP.resendTimer);
    btn.disabled = false;
    btn.textContent = 'Resend code';
  }, 1000);
}

async function fpSendCode(btn) {
  const raw = document.getElementById('fp-identifier').value.trim();
  if (!raw) { toast('Enter your email or mobile number.', 'error'); return; }
  if (isAdminUsername(raw)) { toast('The default admin account cannot be reset here. Contact your system administrator.', 'info'); return; }
  // a login username (no @, not a number) → its email, like the login box
  const identifier = raw.includes('@') || /^[\d\s+()-]+$/.test(raw) ? raw : resolveLoginEmail(raw);
  setLoading(btn, true);
  try {
    const { sent_to } = await resetCodeCall({ action: 'send', identifier });
    FP.identifier = identifier;
    document.getElementById('fp-sub').innerHTML = `We sent a 6-digit code to <strong>${escapeHtml(sent_to)}</strong>. Check your inbox (and spam).`;
    document.getElementById('fp-code').value = '';
    fpShowStep(2);
    fpStartResendTimer();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false);
  }
}

if (document.getElementById('forgot-panel')) {
  document.getElementById('forgot-link')?.addEventListener('click', (e) => { e.preventDefault(); fpOpen(true); });
  document.getElementById('fp-back').addEventListener('click', () => { clearInterval(FP.resendTimer); fpOpen(false); });
  document.getElementById('fp-change').addEventListener('click', () => { clearInterval(FP.resendTimer); fpShowStep(1); });
  document.getElementById('fp-form-1').addEventListener('submit', (e) => { e.preventDefault(); fpSendCode(document.getElementById('fp-send')); });
  document.getElementById('fp-resend').addEventListener('click', (e) => {
    document.getElementById('fp-identifier').value = FP.identifier;
    fpSendCode(e.currentTarget);
  });
  document.querySelectorAll('[data-fp-toggle]').forEach(btn => btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.fpToggle);
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.querySelector('i').className = show ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  }));
  attachPasswordChecklist(document.getElementById('fp-password'));

  document.getElementById('fp-form-2').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = document.getElementById('fp-code').value.replace(/\s/g, '');
    if (!/^\d{6,10}$/.test(code)) { toast('Enter the 6-digit code from the email.', 'error'); return; }
    const btn = document.getElementById('fp-verify');
    setLoading(btn, true);
    try {
      const s = await resetCodeCall({ action: 'verify', identifier: FP.identifier, code });
      const { error } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
      if (error) throw error;
      clearInterval(FP.resendTimer);
      fpShowStep(3);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(btn, false);
    }
  });

  document.getElementById('fp-form-3').addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('fp-password').value;
    const confirm = document.getElementById('fp-confirm').value;
    if (passwordProblem(password)) { toast(passwordProblem(password), 'error'); return; }
    if (password !== confirm) { toast('Those passwords don’t match.', 'error'); return; }
    const btn = document.getElementById('fp-save');
    setLoading(btn, true);
    const { data: upd, error } = await supabase.auth.updateUser({ password });
    if (error) { setLoading(btn, false); toast(error.message, 'error'); return; }

    // Signed in already — the same checks as logging in, then the dashboard.
    const { data: profile } = await supabase.from('profiles').select('id, role, is_active').eq('id', upd.user.id).single();
    if (!profile || !profile.is_active) {
      setLoading(btn, false);
      toast('Password changed, but this account has been deactivated. Contact support.', 'error');
      await supabase.auth.signOut();
      return;
    }
    const approval = await ensureRiderApproval(profile);
    if (!approval.allowed) {
      setLoading(btn, false);
      toast('Password changed. ' + approval.message, 'info');
      await supabase.auth.signOut();
      return;
    }
    toast('Password changed — welcome back!', 'success');
    setTimeout(() => window.location.href = redirectForRole(profile.role), 600);
  });
}

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
  if (passwordProblem(password)) { toast(passwordProblem(password), 'error'); return; }
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
      console.error('Rider document upload failed:', uploadErr && (uploadErr.message || uploadErr));
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
  // Phone photos are often 5–10MB; shrink them so uploads don't fail on weak signal.
  if (typeof shrinkImageFile === 'function') file = await shrinkImageFile(file, { max: 1600 });
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
  if (typeof clearViewState === 'function') clearViewState(); // drafts + remembered sections
  await supabase.auth.signOut();
  window.location.href = rootPath() + 'login.html';
}
