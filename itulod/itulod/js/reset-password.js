/**
 * iTULOD — reset-password.html
 * -----------------------------------------------------------------------
 * Lands here from the link in the "Forgot password?" email. supabaseClient.js
 * is created with detectSessionInUrl: true, so the recovery token in the URL
 * hash is already being turned into a session in the background — we just
 * wait for it (or for a session that's already there) before letting the
 * form submit.
 */

// Password show/hide toggles (same pattern as login.html).
function wirePasswordToggle(btnId, inputId) {
  const btn = document.getElementById(btnId);
  const input = document.getElementById(inputId);
  btn?.addEventListener('click', () => {
    const icon = btn.querySelector('i');
    const isHidden = input.type === 'password';
    input.type = isHidden ? 'text' : 'password';
    icon.className = isHidden ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
  });
}
wirePasswordToggle('pw-toggle-1', 'new-password');
wirePasswordToggle('pw-toggle-2', 'confirm-password');

let recoveryReady = false;
supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') recoveryReady = true;
});
// Belt and suspenders: if the hash was already consumed by the time this
// script ran (fast network, slow script load), there's still a session.
supabase.auth.getSession().then(({ data }) => {
  if (data.session) recoveryReady = true;
});

document.getElementById('reset-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('reset-btn');
  const password = document.getElementById('new-password').value;
  const confirm = document.getElementById('confirm-password').value;

  if (!requireFields({ 'New password': password, 'Confirm new password': confirm })) return;
  if (password.length < 8) { toast('Use at least 8 characters.', 'error'); return; }
  if (password !== confirm) { toast('Those passwords don’t match.', 'error'); return; }

  // A stale/expired/already-used link never establishes a session, so
  // updateUser() below would fail anyway — this just gives a clearer message.
  if (!recoveryReady) {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      toast('This link is invalid or has expired. Request a new one from the login page.', 'error');
      return;
    }
  }

  setLoading(btn, true);
  const { error } = await supabase.auth.updateUser({ password });
  setLoading(btn, false);

  if (error) {
    toast(error.message, 'error');
    return;
  }

  toast('Password updated! Please log in again.', 'success');
  document.getElementById('reset-sub').textContent = 'All set — taking you to log in…';
  document.getElementById('reset-form').style.display = 'none';
  // The recovery link left an active session behind; sign it out so the
  // password change takes effect through a normal, fresh login.
  await supabase.auth.signOut();
  setTimeout(() => { window.location.href = 'login.html'; }, 1500);
});
