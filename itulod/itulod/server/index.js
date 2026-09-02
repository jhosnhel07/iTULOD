require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_ORIGIN || '*', credentials: true }));
app.use(express.json());

// ── API routes ─────────────────────────────────────────────────────────────
app.use('/api/auth',         require('./routes/auth'));
app.use('/api/vehicles',     require('./routes/vehicles'));
app.use('/api/bookings',     require('./routes/bookings'));
app.use('/api/profiles',     require('./routes/profiles'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api',              require('./routes/misc'));

// ── Serve static frontend ──────────────────────────────────────────────────
// The frontend files live one directory up from server/
const FRONTEND = path.join(__dirname, '..');
app.use(express.static(FRONTEND));

// SPA fallback — serve index.html for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`iTULOD server running on http://localhost:${PORT}`));
