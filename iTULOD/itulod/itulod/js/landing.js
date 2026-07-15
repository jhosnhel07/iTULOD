/**
 * iTULOD — landing page behaviour
 */

// mobile nav toggle
document.querySelector('.nav-toggle')?.addEventListener('click', () => {
  document.querySelector('.nav-links').classList.toggle('nav-links--open');
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

    const grid = document.getElementById('vehicle-grid');
    grid.innerHTML = data.map(v => `
      <div class="vehicle-chip">
        <i class="fa-solid ${v.icon || 'fa-car'}"></i>
        <span>${escapeHtml(v.name)}</span>
        <small>${v.capacity} seat${v.capacity > 1 ? 's' : ''} · from ${peso(v.base_fare)}</small>
      </div>
    `).join('');
  } catch (e) {
    // Supabase not configured yet — static fallback in the HTML remains visible.
    console.info('Vehicle list falling back to static markup:', e.message);
  }
})();

// contact form: this is a marketing form, not an authenticated feature,
// so it just confirms receipt (wire to a Supabase table or email
// service if you want it to actually deliver messages)
document.getElementById('contact-form')?.addEventListener('submit', (e) => {
  e.preventDefault();
  toast('Thanks! Our support team will reach out shortly.', 'success');
  e.target.reset();
});
