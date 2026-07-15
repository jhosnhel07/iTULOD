const router = require('express').Router();
const supabase = require('../supabaseAdmin');
const { requireAuth, requireRole } = require('../middleware');

// GET /api/vehicles — available vehicles (any logged-in user)
router.get('/', requireAuth, async (req, res) => {
  const query = supabase.from('vehicles').select('*').order('base_fare');
  if (req.query.available === 'true') query.eq('is_available', true);
  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/vehicles — admin only
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, icon, capacity, is_available, base_fare, per_km_rate } = req.body;
  const { data, error } = await supabase.from('vehicles').insert({ name, icon, capacity, is_available, base_fare, per_km_rate }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PUT /api/vehicles/:id — admin only
router.put('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, icon, capacity, is_available, base_fare, per_km_rate } = req.body;
  const { data, error } = await supabase.from('vehicles').update({ name, icon, capacity, is_available, base_fare, per_km_rate }).eq('id', req.params.id).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// DELETE /api/vehicles/:id — admin only
router.delete('/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const { error } = await supabase.from('vehicles').delete().eq('id', req.params.id);
  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: 'Deleted' });
});

module.exports = router;
