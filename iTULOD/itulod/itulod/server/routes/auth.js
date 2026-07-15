const router = require('express').Router();
const supabase = require('../supabaseAdmin');
const { requireAuth } = require('../middleware');

// POST /api/auth/login
router.post('/login', async (req, res) => {
  console.log('\n[LOGIN ATTEMPT] body:', JSON.stringify(req.body));
  const { email, password } = req.body;
  if (!email || !password) {
    console.log('[LOGIN] Missing email or password');
    return res.status(400).json({ error: 'Email and password required' });
  }

  console.log('[LOGIN] Calling signInWithPassword for:', email);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    console.error('[LOGIN] Supabase error:', error.message, '| code:', error.code);
    return res.status(401).json({ error: error.message });
  }
  console.log('[LOGIN] Supabase sign-in OK. User ID:', data.user.id);

  const { data: profile, error: profileErr } = await supabase.from('profiles')
    .select('role, is_active').eq('id', data.user.id).single();
  console.log('[LOGIN] Profile:', profile, '| profileErr:', profileErr?.message);

  if (!profile?.is_active) {
    console.log('[LOGIN] Account inactive or profile missing — returning 403');
    await supabase.auth.admin.signOut(data.session.access_token);
    return res.status(403).json({ error: 'Account is deactivated. Contact support.' });
  }

  if (profile.role === 'rider') {
    const { data: applications = [], error: appErr } = await supabase
      .from('rider_applications')
      .select('status')
      .eq('rider_id', data.user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const application = applications?.[0];
    if (appErr || !application || application.status !== 'approved') {
      await supabase.auth.admin.signOut(data.session.access_token);
      return res.status(403).json({ error: 'Your rider account is pending admin approval.' });
    }
  }

  console.log('[LOGIN] Success! Returning session for role:', profile.role);
  res.json({ session: data.session, role: profile.role, refresh_token: data.session.refresh_token });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, full_name, phone, role, vehicle_type, license_number, vehicle_plate } = req.body;
  if (!email || !password || !full_name || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name, role }
  });
  if (error) return res.status(400).json({ error: error.message });

  const userId = data.user.id;
  if (phone) await supabase.from('profiles').update({ phone }).eq('id', userId);

  if (role === 'rider') {
    await supabase.from('rider_applications').insert({
      rider_id: userId, vehicle_type: vehicle_type || 'Motorcycle',
      license_number: license_number || null, vehicle_plate: vehicle_plate || null,
      status: 'pending'
    });
  }

  res.json({ user_id: userId, message: 'Account created successfully' });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res) => {
  await supabase.auth.admin.signOut(req.headers.authorization.replace('Bearer ', ''));
  res.json({ message: 'Logged out' });
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  const { email, redirectTo } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Reset link sent' });
});

// GET /api/auth/me — verify token and return profile
router.get('/me', requireAuth, (req, res) => {
  res.json({ profile: req.profile });
});

module.exports = router;
