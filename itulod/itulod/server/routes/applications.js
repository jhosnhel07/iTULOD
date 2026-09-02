const router = require('express').Router();
const supabase = require('../supabaseAdmin');
const { requireAuth, requireRole } = require('../middleware');

// GET /api/applications/mine — rider's own application
router.get('/mine', requireAuth, requireRole('rider'), async (req, res) => {
  const { data, error } = await supabase.from('rider_applications')
    .select('*').eq('rider_id', req.profile.id)
    .order('created_at', { ascending: false }).limit(1).single();
  if (error) return res.status(404).json({ error: error.message });
  res.json(data);
});

// GET /api/applications/pending — admin
router.get('/pending', requireAuth, requireRole('admin'), async (req, res) => {
  const { data, error } = await supabase.from('rider_applications')
    .select('*, rider:rider_id(full_name,email,phone)')
    .eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// PATCH /api/applications/:id/decide — admin approve/reject
router.patch('/:id/decide', requireAuth, requireRole('admin'), async (req, res) => {
  const { status, notes } = req.body;
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const { data: app, error } = await supabase.from('rider_applications')
    .update({ status, notes, reviewed_by: req.profile.id, reviewed_at: new Date().toISOString() })
    .eq('id', req.params.id).select('rider_id').single();
  if (error) return res.status(400).json({ error: error.message });

  await supabase.from('notifications').insert({
    user_id: app.rider_id,
    title: status === 'approved' ? 'Application approved!' : 'Application update',
    message: status === 'approved'
      ? 'You can now accept booking requests.'
      : 'Your rider application was not approved. Contact support for details.'
  });

  res.json({ message: `Application ${status}` });
});

module.exports = router;
