const router = require('express').Router();
const supabase = require('../supabaseAdmin');
const { requireAuth, requireRole } = require('../middleware');

// GET /api/profiles/me
router.get('/me', requireAuth, (req, res) => res.json(req.profile));

// PATCH /api/profiles/me
router.patch('/me', requireAuth, async (req, res) => {
  const { full_name, phone, avatar_url } = req.body;
  const { data, error } = await supabase.from('profiles')
    .update({ full_name, phone, avatar_url }).eq('id', req.profile.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// GET /api/profiles?role=rider|customer — admin only
router.get('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { role } = req.query;
  let query = supabase.from('profiles').select('*').order('created_at', { ascending: false });
  if (role) query = query.eq('role', role);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/profiles/riders — admin: all riders with application + avg rating
router.get('/riders', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.from('profiles')
    .select('*, rider_applications!rider_applications_rider_id_fkey(vehicle_type, status)')
    .eq('role', 'rider').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const riderIds = data.map(r => r.id);
  const { data: reviews } = await supabase.from('reviews')
    .select('rider_id, rating').in('rider_id', riderIds);
  const reviewMap = {};
  (reviews || []).forEach(rv => {
    if (!reviewMap[rv.rider_id]) reviewMap[rv.rider_id] = [];
    reviewMap[rv.rider_id].push(rv.rating);
  });
  const result = data.map(r => {
    const ratings = reviewMap[r.id] || [];
    const avg = ratings.length ? (ratings.reduce((a, x) => a + x, 0) / ratings.length).toFixed(1) : null;
    return { ...r, avg_rating: avg };
  });
  res.json(result);
});

// PATCH /api/profiles/:id/active — admin toggle active
router.patch('/:id/active', requireAuth, requireRole('admin'), async (req, res) => {
  const { is_active } = req.body;
  const { data, error } = await supabase.from('profiles')
    .update({ is_active }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
