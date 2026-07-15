/**
 * iTULOD — Supabase client configuration
 * ---------------------------------------
 * Public keys live in config.js (Project Settings → API).
 * These are safe to expose in frontend code — the publishable key only
 * works within the boundaries of your Row Level Security policies.
 */

const SUPABASE_URL = CONFIG.SUPABASE_URL;
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_PUBLISHABLE_KEY;

// Loaded globally via the CDN script tag in each HTML page:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
var supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

// Vehicle type -> Font Awesome icon fallback map (used before vehicles table loads)
const VEHICLE_ICONS = {
  Motorcycle: 'fa-motorcycle',
  Tricycle: 'fa-bicycle',
  Bicycle: 'fa-bicycle',
  Car: 'fa-car',
  SUV: 'fa-car-side',
  Van: 'fa-shuttle-van',
  Jeepney: 'fa-bus-alt',
  Bus: 'fa-bus',
  Truck: 'fa-truck'
};
