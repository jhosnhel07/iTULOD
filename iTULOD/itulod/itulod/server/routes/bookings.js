const router = require('express').Router();
const supabase = require('../supabaseAdmin');
const { requireAuth, requireRole } = require('../middleware');

const TABLES = {
  transport: 'transport_bookings',
  food: 'food_deliveries',
  parcel: 'parcel_deliveries'
};

// GET /api/bookings/:kind — scoped by role
router.get('/:kind', requireAuth, async (req, res) => {
  const table = TABLES[req.params.kind];
  if (!table) return res.status(400).json({ error: 'Invalid booking kind' });

  const { role, id } = req.profile;
  let query = supabase.from(table).select('*').order('created_at', { ascending: false });

  if (role === 'customer') query = query.eq('customer_id', id);
  else if (role === 'rider') {
    const filter = req.query.filter;
    if (filter === 'available') query = query.is('rider_id', null).eq('status', 'pending');
    else if (filter === 'accepted') query = query.eq('rider_id', id).in('status', ['accepted', 'ongoing']);
    else if (filter === 'history') query = query.eq('rider_id', id).in('status', ['completed', 'cancelled']);
    else query = query.eq('rider_id', id);
  } else if (role === 'admin') {
    // admin sees all; optionally join customer/rider names
    query = supabase.from(table)
      .select('*, customer:customer_id(full_name), rider:rider_id(full_name)')
      .order('created_at', { ascending: false }).limit(50);
  }

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// POST /api/bookings/:kind — customer creates booking
router.post('/:kind', requireAuth, requireRole('customer'), async (req, res) => {
  const table = TABLES[req.params.kind];
  if (!table) return res.status(400).json({ error: 'Invalid booking kind' });
  const { data, error } = await supabase.from(table)
    .insert({ ...req.body, customer_id: req.profile.id }).select('id').single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// PATCH /api/bookings/:kind/:id — rider updates status, customer cancels
router.patch('/:kind/:id', requireAuth, async (req, res) => {
  const table = TABLES[req.params.kind];
  if (!table) return res.status(400).json({ error: 'Invalid booking kind' });

  const { role, id: userId } = req.profile;
  const { id } = req.params;
  const patch = req.body;

  // Riders accepting a booking
  if (patch.status === 'accepted' && role === 'rider') {
    patch.rider_id = userId;
    const { data, error } = await supabase.from(table)
      .update(patch).eq('id', id).is('rider_id', null).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  // Riders updating status (ongoing/completed)
  if (role === 'rider') {
    if (patch.status === 'completed') {
      const { data: row } = await supabase.from(table).select('estimated_fare, customer_id, payment_method').eq('id', id).single();
      patch.final_fare = row?.estimated_fare;
      // Insert payment record
      const commission = Number((row.estimated_fare * 0.15).toFixed(2));
      const { error: payErr } = await supabase.from('payments').insert({
        customer_id: row.customer_id, rider_id: userId,
        booking_type: req.params.kind, booking_id: id,
        amount: row.estimated_fare, platform_commission: commission,
        rider_payout: Number((row.estimated_fare - commission).toFixed(2)),
        method: row.payment_method || 'cash', status: 'paid'
      });
      if (payErr) console.error('Payment insert error:', payErr.message);
      if ((row.payment_method || 'cash') === 'cash') {
        await supabase.from(table).update({ payment_status: 'paid' }).eq('id', id);
      }
    }
    const { data, error } = await supabase.from(table).update(patch).eq('id', id).eq('rider_id', userId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  // Customers cancelling
  if (role === 'customer') {
    const { data, error } = await supabase.from(table)
      .update(patch).eq('id', id).eq('customer_id', userId).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  // Admin can update anything
  if (role === 'admin') {
    const { data, error } = await supabase.from(table).update(patch).eq('id', id).select().single();
    if (error) return res.status(400).json({ error: error.message });
    return res.json(data);
  }

  res.status(403).json({ error: 'Forbidden' });
});

module.exports = router;
