const router = require('express').Router();
const supabase = require('../supabaseAdmin');
const { requireAuth, requireRole } = require('../middleware');

// ── Notifications ──────────────────────────────────────────────────────────
router.get('/notifications', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('notifications')
    .select('*').eq('user_id', req.profile.id)
    .order('created_at', { ascending: false }).limit(30);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.patch('/notifications/read', requireAuth, async (req, res) => {
  await supabase.from('notifications')
    .update({ is_read: true }).eq('user_id', req.profile.id).eq('is_read', false);
  res.json({ message: 'Marked read' });
});

// ── Reviews ────────────────────────────────────────────────────────────────
router.get('/reviews/my-rating', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('reviews')
    .select('rating').eq('rider_id', req.profile.id);
  if (error) return res.status(500).json({ error: error.message });
  const ratings = (data || []).map(r => r.rating);
  const avg = ratings.length ? (ratings.reduce((a, x) => a + x, 0) / ratings.length).toFixed(1) : null;
  res.json({ avg_rating: avg, count: ratings.length });
});

router.post('/reviews', requireAuth, requireRole('customer'), async (req, res) => {
  const { kind, booking_id, rating, comment } = req.body;
  const TABLES = { transport: 'transport_bookings', food: 'food_deliveries', parcel: 'parcel_deliveries' };
  const table = TABLES[kind];
  if (!table) return res.status(400).json({ error: 'Invalid kind' });

  const { data: booking } = await supabase.from(table).select('rider_id').eq('id', booking_id).single();
  await supabase.from(table).update({ rating, review: comment }).eq('id', booking_id);

  if (booking?.rider_id) {
    await supabase.from('reviews').insert({
      customer_id: req.profile.id, rider_id: booking.rider_id,
      booking_type: kind, booking_id, rating, comment
    });
  }
  res.json({ message: 'Review submitted' });
});

// ── Payments ───────────────────────────────────────────────────────────────
router.get('/payments', requireAuth, async (req, res) => {
  const { role, id } = req.profile;
  let query = supabase.from('payments')
    .select('*, customer:customer_id(full_name), rider:rider_id(full_name)')
    .order('created_at', { ascending: false });

  if (role === 'rider') query = query.eq('rider_id', id);
  else if (role === 'customer') query = query.eq('customer_id', id);
  else query = query.limit(50); // admin

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// ── Announcements ──────────────────────────────────────────────────────────
router.get('/announcements', requireAuth, async (req, res) => {
  const { data, error } = await supabase.from('announcements')
    .select('*').order('created_at', { ascending: false }).limit(20);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

router.post('/announcements', requireAuth, requireRole('admin'), async (req, res) => {
  const { title, body, audience } = req.body;
  const { data, error } = await supabase.from('announcements')
    .insert({ title, body, audience, created_by: req.profile.id }).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// ── Analytics (admin) ──────────────────────────────────────────────────────
router.get('/analytics', requireAuth, requireRole('admin'), async (req, res) => {
  const TABLES = ['transport_bookings', 'food_deliveries', 'parcel_deliveries'];
  const [
    { count: customerCount },
    { count: riderCount },
    { count: pendingApps },
    ...bookingResults
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'customer'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'rider'),
    supabase.from('rider_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ...TABLES.map(t => supabase.from(t).select('status, final_fare, created_at'))
  ]);

  const allBookings = bookingResults.flatMap(r => r.data || []);
  const revenue = allBookings.filter(b => b.status === 'completed')
    .reduce((a, b) => a + Number(b.final_fare || 0), 0);

  const statuses = ['pending', 'completed', 'cancelled', 'ongoing', 'accepted'];
  const statusCounts = {};
  statuses.forEach(s => statusCounts[s] = allBookings.filter(b => b.status === s).length);

  const days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (6 - i)); return d;
  });
  const dailyRevenue = days.map(d => ({
    label: d.toLocaleDateString('en-PH', { weekday: 'short' }),
    total: allBookings.filter(b => b.status === 'completed' && new Date(b.created_at).toDateString() === d.toDateString())
      .reduce((a, b) => a + Number(b.final_fare || 0), 0)
  }));

  res.json({ customerCount, riderCount, pendingApps, totalBookings: allBookings.length, revenue, statusCounts, dailyRevenue });
});

// ── Upload signed URL for rider documents ─────────────────────────────────
router.post('/upload/rider-doc', requireAuth, async (req, res) => {
  const { filename, kind } = req.body; // kind: 'license' | 'orcr'
  const path = `${req.profile.id}/${kind}-${Date.now()}-${filename}`;
  const { data, error } = await supabase.storage.from('rider-documents')
    .createSignedUploadUrl(path);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ signedUrl: data.signedUrl, path });
});

// ── Upload signed URL for avatars ─────────────────────────────────────────
router.post('/upload/avatar', requireAuth, async (req, res) => {
  const { filename } = req.body;
  const path = `${req.profile.id}/avatar-${Date.now()}-${filename}`;
  const { data, error } = await supabase.storage.from('avatars')
    .createSignedUploadUrl(path);
  if (error) return res.status(500).json({ error: error.message });
  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
  res.json({ signedUrl: data.signedUrl, path, publicUrl });
});

module.exports = router;
