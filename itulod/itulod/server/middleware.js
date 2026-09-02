const supabase = require('./supabaseAdmin');

async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return res.status(401).json({ error: 'Invalid or expired token' });

  const { data: profile, error: profileErr } = await supabase
    .from('profiles').select('*').eq('id', user.id).single();
  if (profileErr || !profile) return res.status(401).json({ error: 'Profile not found' });
  if (!profile.is_active) return res.status(403).json({ error: 'Account is deactivated' });

  if (profile.role === 'rider') {
    const { data: applications = [], error: appErr } = await supabase
      .from('rider_applications')
      .select('status')
      .eq('rider_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(1);

    const application = applications?.[0];
    if (appErr || !application || application.status !== 'approved') {
      return res.status(403).json({ error: 'Your rider account is pending admin approval.' });
    }
  }

  req.user = user;
  req.profile = profile;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.profile?.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
