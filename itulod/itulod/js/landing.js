/**
 * iTULOD — landing page behaviour
 */

// mobile nav toggle
document.querySelector('.nav-toggle')?.addEventListener('click', () => {
  document.querySelector('.nav-links').classList.toggle('nav-links--open');
});
// close the mobile menu once a link inside it is used
document.querySelectorAll('.nav-links a').forEach(link => {
  link.addEventListener('click', () => {
    document.querySelector('.nav-links').classList.remove('nav-links--open');
  });
});

// load live vehicle categories from Supabase (falls back to the static
// markup already in index.html if the request fails, e.g. before the
// project's SUPABASE_URL/ANON_KEY have been configured)
(async function loadVehicles() {
  try {
    const { data, error } = await supabase
      .from('vehicles')
      .select('*')
      .eq('is_available', true)
      .order('base_fare', { ascending: true });
    if (error || !data || data.length === 0) return;
    showSampleFare(data);

    const grid = document.getElementById('vehicle-grid');
    grid.innerHTML = data.map(v => `
      <div class="vehicle-chip">
        <i class="fa-solid ${v.icon || 'fa-car'}"></i>
        <span>${escapeHtml(v.name)}</span>
        <small>${v.service === 'hauling' ? 'Hauling' : `${v.capacity} seat${v.capacity > 1 ? 's' : ''}`} · from ${peso(v.base_fare)}</small>
      </div>
    `).join('');
  } catch (e) {
    // Supabase not configured yet — static fallback in the HTML remains visible.
    console.info('Vehicle list falling back to static markup:', e.message);
  }
})();

// The hero's "tracked live" card: a sample Laoag → Batac trip priced with
// the live Motorcycle rates (the same formula as booking), counting up.
const SAMPLE_TRIP_KM = 18.5;
function showSampleFare(vehicles) {
  const moto = vehicles.find(v => v.name === 'Motorcycle') || vehicles.find(v => (v.service || 'standard') !== 'hauling');
  if (!moto) return;
  const fare = Number(moto.base_fare) + Number(moto.per_km_rate) * SAMPLE_TRIP_KM;
  const trip = document.getElementById('board-trip');
  if (trip) trip.textContent = `Laoag City → Batac City · ${SAMPLE_TRIP_KM} km · ${moto.name}`;
  countUpFare(fare);
}
function countUpFare(target) {
  const el = document.getElementById('board-fare');
  if (!el) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = peso(target);
    return;
  }
  const start = performance.now(), dur = 1200;
  const step = (t) => {
    const p = Math.min(1, (t - start) / dur);
    el.textContent = peso(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// contact form: this is a marketing form, not an authenticated feature,
// so it just confirms receipt (wire to a Supabase table or email
// service if you want it to actually deliver messages)
document.getElementById('contact-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  toast('Thanks! Our support team will reach out shortly.', 'success');
  e.target.reset();
});

// Gentle scroll-reveal for landing sections. The class is only added here, so
// if this script never runs every section simply stays visible.
(function revealOnScroll() {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const targets = document.querySelectorAll('.section .section-head, .section .container > *:not(.section-head)');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (!e.isIntersecting) return;
      e.target.classList.add('is-visible');
      io.unobserve(e.target);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  targets.forEach((el) => { el.classList.add('reveal'); io.observe(el); });
})();

// Contact details set by the admin (Admin → Settings, sql/034). The page
// keeps its built-in text when nothing is set or the call fails.
(async function loadContactInfo() {
  if (typeof supabase === 'undefined') return;
  const { data, error } = await supabase.rpc('public_site_info');
  const info = !error && data && data[0];
  if (!info) return;
  const put = (id, value) => { const el = document.getElementById(id); if (el && value) el.textContent = value; };
  put('contact-phone', info.support_phone);
  put('contact-email', info.support_email);
  put('contact-office', info.office_address);
})();
