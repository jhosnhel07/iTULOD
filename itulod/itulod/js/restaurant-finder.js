/**
 * iTULOD — restaurant finder for the food "Choose a restaurant" modal.
 *
 * 200+ places across Ilocos Norte, so the list is narrowed four ways:
 *   1. "Deliver to" — nearest first, with distance + delivery fee per card
 *   2. category chips (Fast food, Ilocano, Coffee & milk tea, …)
 *   3. town filter
 *   4. search that also matches dishes ("bagnet", "milk tea")
 * The mobile app's BookFoodScreen mirrors this (restaurant_finder.dart) —
 * keep the town list and category rules in sync.
 */

// Poblacion centres (OpenStreetMap). `match` finds the town in an address.
const ILOCOS_NORTE_TOWNS = [
  { name: 'Laoag City', match: /\blaoag\b/i, lat: 18.1954482, lng: 120.5926755 },
  { name: 'Batac City', match: /\bbatac\b/i, lat: 18.0547132, lng: 120.5645187 },
  { name: 'Adams', match: /\badams\b/i, lat: 18.4613933, lng: 120.9015722 },
  { name: 'Bacarra', match: /\bbacarra\b/i, lat: 18.2514574, lng: 120.6102374 },
  { name: 'Badoc', match: /\bbadoc\b/i, lat: 17.9269759, lng: 120.475124 },
  { name: 'Bangui', match: /\bbangui\b/i, lat: 18.5366878, lng: 120.7655254 },
  { name: 'Banna', match: /\bbanna\b/i, lat: 17.9798602, lng: 120.6550315 },
  { name: 'Burgos', match: /\bburgos\b/i, lat: 18.5117704, lng: 120.64429 },
  { name: 'Carasi', match: /\bcarasi\b/i, lat: 18.1401114, lng: 120.8212426 },
  { name: 'Currimao', match: /\bcurrimao\b/i, lat: 18.0200584, lng: 120.4865068 },
  { name: 'Dingras', match: /\bdingras\b/i, lat: 18.1030975, lng: 120.6975437 },
  { name: 'Dumalneg', match: /\bdumalneg\b/i, lat: 18.5223727, lng: 120.8089365 },
  { name: 'Marcos', match: /\bmarcos\b(?!\s+ave)/i, lat: 18.0434623, lng: 120.6782391 },
  { name: 'Nueva Era', match: /\bnueva era\b/i, lat: 17.9150989, lng: 120.6642509 },
  { name: 'Pagudpud', match: /\bpagudpud\b/i, lat: 18.5591345, lng: 120.7870256 },
  { name: 'Paoay', match: /\bpaoay\b/i, lat: 18.0619547, lng: 120.5206137 },
  { name: 'Pasuquin', match: /\bpasuquin\b/i, lat: 18.3335315, lng: 120.618455 },
  { name: 'Piddig', match: /\bpiddig\b/i, lat: 18.1652098, lng: 120.7163881 },
  { name: 'Pinili', match: /\bpinili\b/i, lat: 17.9524076, lng: 120.5272509 },
  { name: 'San Nicolas', match: /\bsan nicolas\b/i, lat: 18.1734458, lng: 120.5944583 },
  { name: 'Sarrat', match: /\bsarrat\b/i, lat: 18.1567792, lng: 120.644784 },
  { name: 'Solsona', match: /\bsolsona\b/i, lat: 18.0926692, lng: 120.7725709 },
  { name: 'Vintar', match: /\bvintar\b/i, lat: 18.2304271, lng: 120.6490336 },
];

// Matched against "<cuisine_type> <name>". A place can be in several.
const FOOD_CATEGORIES = [
  { id: 'fastfood', label: 'Fast food', icon: 'fa-burger', re: /fast food|burger|shawarma/i },
  { id: 'ilocano', label: 'Ilocano', icon: 'fa-bowl-food', re: /ilocano|empanada|miki|native delicacies/i },
  { id: 'empanada', label: 'Empanada & miki', icon: 'fa-cookie', re: /empanada|miki/i },
  { id: 'coffee', label: 'Coffee & milk tea', icon: 'fa-mug-hot', re: /caf[eé]|coffee|milk tea/i },
  { id: 'bakery', label: 'Bakery & sweets', icon: 'fa-bread-slice', re: /bak|donut|dessert|delicacies/i },
  { id: 'pizza', label: 'Pizza & pasta', icon: 'fa-pizza-slice', re: /pizza|pasta/i },
  { id: 'chicken', label: 'Chicken', icon: 'fa-drumstick-bite', re: /chicken|wings/i },
  { id: 'asian', label: 'Korean & Japanese', icon: 'fa-bowl-rice', re: /korean|japanese/i },
  { id: 'chinese', label: 'Chinese', icon: 'fa-utensils', re: /chinese/i },
  { id: 'grill', label: 'Grill & seafood', icon: 'fa-fire', re: /grill|seafood/i },
  { id: 'meals', label: 'Filipino meals', icon: 'fa-plate-wheat', re: /filipino|carinderia|silog|pares|international|mexican/i },
];

const ROAD_FACTOR = 1.3; // straight line → typical road distance (same as the app's MapConfig)

function _haversineKm(a, b) {
  const R = 6371, toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR, dLng = (b.lng - a.lng) * toR;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

function nearestTown(point) {
  return ILOCOS_NORTE_TOWNS.reduce((best, t) =>
    _haversineKm(point, t) < _haversineKm(point, best) ? t : best).name;
}

/** The town is the last one named in the address; else the nearest centre. */
function restaurantTown(r) {
  let best = null, bestAt = -1;
  for (const t of ILOCOS_NORTE_TOWNS) {
    const re = new RegExp(t.match.source, 'gi');
    let m;
    while ((m = re.exec(r.address || '')) !== null) {
      if (m.index > bestAt) { bestAt = m.index; best = t.name; }
    }
  }
  if (best) return best;
  return (r.lat != null && r.lng != null) ? nearestTown({ lat: r.lat, lng: r.lng }) : 'Other';
}

function restaurantCategories(r) {
  const hay = `${r.cuisine_type || ''} ${r.name}`;
  return FOOD_CATEGORIES.filter(c => c.re.test(hay)).map(c => c.id);
}

// ---- state ----------------------------------------------------------------
const FINDER = {
  restaurants: [],
  dishes: null,          // restaurant_id -> [dish names], loaded once
  deliverTo: null,       // { key, label, lat, lng, address }
  town: 'all',
  category: 'all',
  query: '',
};

/** Every available dish name, keyed by restaurant (paged past the 1000-row cap). */
async function _loadDishIndex() {
  if (FINDER.dishes) return FINDER.dishes;
  const index = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('menu_items')
      .select('restaurant_id, name').eq('is_available', true).range(from, from + 999);
    if (error) { console.warn('dish index failed:', error.message); break; }
    (data || []).forEach(m => (index[m.restaurant_id] ||= []).push(m.name));
    if (!data || data.length < 1000) break;
  }
  FINDER.dishes = index;
  return index;
}

/** "Deliver to" choices: the food form's map pin, saved addresses, GPS. */
function _deliverOptions() {
  const opts = [];
  const pin = typeof getMapMarkerLngLat === 'function' ? getMapMarkerLngLat('food', 'dropoff') : null;
  const typed = (document.getElementById('food-address')?.value || '').trim();
  if (pin) opts.push({ key: 'pin', label: `Delivery pin${typed ? ' — ' + typed : ''}`, lng: pin[0], lat: pin[1], address: typed });
  (typeof SAVED_ADDRESSES !== 'undefined' ? SAVED_ADDRESSES : [])
    .filter(a => a.lat != null && a.lng != null)
    .forEach(a => opts.push({ key: 'saved:' + a.id, label: `${a.label} — ${a.address}`, lat: a.lat, lng: a.lng, address: a.address }));
  opts.push({ key: 'gps', label: 'Use my current location' });
  opts.push({ key: 'none', label: 'Anywhere (sort A–Z)' });
  return opts;
}

/** Put the chosen "Deliver to" on the food form too (address + map pin). */
async function _applyToFoodForm(place) {
  const input = document.getElementById('food-address');
  if (!input || !place || place.key === 'pin') return;
  let address = place.address;
  if (!address && typeof _reverseGeocode === 'function') {
    address = await _reverseGeocode({ lng: place.lng, lat: place.lat });
  }
  if (!address) return;
  input.value = address;
  if (typeof _maps !== 'undefined' && _maps.food?.map && typeof _setStop === 'function') {
    setMapMode('dropoff', 'food');
    _setStop('food', [place.lng, place.lat], address);
  }
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function _deliveryFeeFrom(km) {
  const v = (typeof VEHICLES !== 'undefined' && VEHICLES.length) ? VEHICLES[0] : null; // cheapest (ordered by base fare)
  return v ? estimateFare(v, km) : null;
}

// ---- render -----------------------------------------------------------------
// ---- presentation helpers (also used by the menu view in customer.js) -------
// Category → tile colours. Brand blue / rose families plus a few warm and
// green tints so a long list scans easily; never the red/amber status colours.
const CATEGORY_VISUAL = {
  fastfood: { bg: 'var(--blue-50)', fg: 'var(--blue)' },
  ilocano: { bg: 'var(--rose-50)', fg: 'var(--rose-deep)' },
  empanada: { bg: '#fbf1e1', fg: '#a8661b' },
  coffee: { bg: '#f3ebe6', fg: '#7a5340' },
  bakery: { bg: '#fbf1e1', fg: '#a8661b' },
  pizza: { bg: 'var(--rose-100)', fg: 'var(--rose-deep)' },
  chicken: { bg: 'var(--blue-100)', fg: 'var(--blue-dark)' },
  asian: { bg: 'var(--blue-50)', fg: 'var(--blue-dark)' },
  chinese: { bg: 'var(--rose-50)', fg: 'var(--rose-deep)' },
  grill: { bg: 'var(--green-tint)', fg: 'var(--green-dark)' },
  meals: { bg: 'var(--green-tint)', fg: 'var(--green-dark)' },
};

function restaurantVisual(r) {
  const cats = r._cats || restaurantCategories(r);
  const id = cats[0];
  const cat = FOOD_CATEGORIES.find(c => c.id === id);
  return { icon: cat ? cat.icon : 'fa-store', ...(CATEGORY_VISUAL[id] || { bg: 'var(--slate-50)', fg: 'var(--slate-500)' }) };
}

/** Distance + cheapest delivery fee from the current "Deliver to", if any. */
function restaurantDistance(r) {
  const here = FINDER.deliverTo;
  if (!here || r.lat == null || r.lng == null) return { km: null, fee: null };
  const km = _haversineKm(here, r) * ROAD_FACTOR;
  return { km, fee: _deliveryFeeFrom(km) };
}

function restaurantLogoTile(r, size = '') {
  const v = restaurantVisual(r);
  return `<div class="rf-logo ${size}" style="--tile-bg:${v.bg};--tile-fg:${v.fg}"><i class="fa-solid ${v.icon}"></i></div>`;
}

/** Name without a trailing "(Town)" — the town is already shown as a tag.
 *  Branch details like "(Marcos Ave., Batac City)" are kept. */
function restaurantDisplayName(r) {
  const town = r._town || restaurantTown(r);
  const suffix = ` (${town})`;
  const name = r.name || '';
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

function _deliverShortLabel(place) {
  if (!place) return '';
  if (place.key === 'gps') return 'your location';
  if (place.key === 'pin') return 'your delivery pin';
  return place.label.split(' — ')[0];
}

// ---- render -----------------------------------------------------------------
function renderRestaurantFinder(body, restaurants) {
  FINDER.restaurants = restaurants.map(r => ({ ...r, _town: restaurantTown(r), _cats: restaurantCategories(r) }));

  const opts = _deliverOptions();
  if (!FINDER.deliverTo || !opts.some(o => o.key === FINDER.deliverTo.key)) {
    FINDER.deliverTo = opts.find(o => o.lat != null) || null;
  }

  const townCounts = {};
  FINDER.restaurants.forEach(r => { townCounts[r._town] = (townCounts[r._town] || 0) + 1; });
  const towns = Object.keys(townCounts).sort((a, b) => townCounts[b] - townCounts[a]);

  body.innerHTML = `
    <div class="rf-panel">
      <div class="rf-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" id="restaurant-search" value="${escapeHtml(FINDER.query)}"
               placeholder="Search a restaurant or dish — bagnet, milk tea, Jollibee…" autocomplete="off">
      </div>
      <div class="rf-controls">
        <label class="rf-select">
          <i class="fa-solid fa-location-dot"></i>
          <span class="rf-select__body">
            <span class="rf-select__label">Deliver to</span>
            <select id="rf-deliver">
              ${opts.map(o => `<option value="${escapeHtml(o.key)}" ${FINDER.deliverTo?.key === o.key ? 'selected' : ''}>${escapeHtml(o.label)}</option>`).join('')}
            </select>
          </span>
        </label>
        <label class="rf-select">
          <i class="fa-solid fa-map-location-dot"></i>
          <span class="rf-select__body">
            <span class="rf-select__label">Town</span>
            <select id="rf-town">
              <option value="all">All of Ilocos Norte</option>
              ${towns.map(t => `<option value="${escapeHtml(t)}" ${FINDER.town === t ? 'selected' : ''}>${escapeHtml(t)} (${townCounts[t]})</option>`).join('')}
            </select>
          </span>
        </label>
      </div>
      <div class="rf-chips" id="rf-chips" role="tablist" aria-label="Food categories"></div>
    </div>
    <div class="rf-summary" id="rf-count"></div>
    <div class="rf-list" id="restaurant-results"></div>`;

  document.getElementById('rf-deliver').addEventListener('change', async (e) => {
    const key = e.target.value;
    if (key === 'none') { FINDER.deliverTo = null; return _renderResults(); }
    if (key === 'gps') {
      if (!navigator.geolocation) { toast('Location is not available in this browser.', 'error'); return; }
      toast('Finding your location…', 'info');
      navigator.geolocation.getCurrentPosition(async (pos) => {
        FINDER.deliverTo = { key: 'gps', label: 'My current location', lat: pos.coords.latitude, lng: pos.coords.longitude };
        _renderResults();
        await _applyToFoodForm(FINDER.deliverTo);
      }, () => toast("Couldn't get your location — pick a saved address instead.", 'error'),
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
      return;
    }
    FINDER.deliverTo = opts.find(o => o.key === key) || null;
    _renderResults();
    await _applyToFoodForm(FINDER.deliverTo);
  });
  document.getElementById('rf-town').addEventListener('change', (e) => { FINDER.town = e.target.value; _renderResults(); });
  document.getElementById('restaurant-search').addEventListener('input', (e) => { FINDER.query = e.target.value; _renderResults(); });
  document.getElementById('restaurant-results').addEventListener('click', (e) => {
    const card = e.target.closest('[data-restaurant-id]');
    if (!card) return;
    const r = FINDER.restaurants.find(x => x.id === card.dataset.restaurantId);
    if (r) selectRestaurantForMenu(_stripFinderFields(r));
  });

  _renderResults();
  _loadDishIndex().then(() => { if (FINDER.query) _renderResults(); });
}

function _renderResults() {
  const results = document.getElementById('restaurant-results');
  if (!results) return;
  const words = FINDER.query.toLowerCase().split(/\s+/).filter(Boolean);
  const inTown = FINDER.restaurants.filter(r => FINDER.town === 'all' || r._town === FINDER.town);

  // Chips only for categories that exist in the selected town, with counts.
  const chips = document.getElementById('rf-chips');
  const present = FOOD_CATEGORIES
    .map(c => ({ ...c, count: inTown.filter(r => r._cats.includes(c.id)).length }))
    .filter(c => c.count > 0);
  if (FINDER.category !== 'all' && !present.some(c => c.id === FINDER.category)) FINDER.category = 'all';
  chips.innerHTML = [{ id: 'all', label: 'All', icon: 'fa-store', count: inTown.length }, ...present].map(c => `
    <button type="button" role="tab" aria-selected="${FINDER.category === c.id}"
            class="rf-chip ${FINDER.category === c.id ? 'active' : ''}" data-cat="${c.id}">
      <i class="fa-solid ${c.icon}"></i><span>${escapeHtml(c.label)}</span><span class="rf-chip__count">${c.count}</span>
    </button>`).join('');
  chips.querySelectorAll('.rf-chip').forEach(b => b.addEventListener('click', () => {
    FINDER.category = b.dataset.cat; _renderResults();
  }));

  const here = FINDER.deliverTo;
  const list = inTown
    .filter(r => FINDER.category === 'all' || r._cats.includes(FINDER.category))
    .map(r => {
      const dishes = FINDER.dishes?.[r.id] || [];
      let dishHits = [];
      if (words.length) {
        const hay = `${r.name} ${r.address} ${r.cuisine_type || ''}`.toLowerCase();
        dishHits = dishes.filter(d => words.every(w => d.toLowerCase().includes(w)));
        if (!words.every(w => hay.includes(w)) && dishHits.length === 0) return null;
      }
      return { r, ...restaurantDistance(r), dishHits };
    })
    .filter(Boolean);

  list.sort((a, b) => (a.km != null && b.km != null) ? a.km - b.km : a.r.name.localeCompare(b.r.name));

  document.getElementById('rf-count').innerHTML = `
    <strong>${list.length} place${list.length === 1 ? '' : 's'}</strong>
    <span>${here ? `<i class="fa-solid fa-arrow-down-short-wide"></i> Nearest to ${escapeHtml(_deliverShortLabel(here))}` : 'Sorted A–Z'}</span>`;

  results.innerHTML = list.length
    ? list.map(({ r, km, fee, dishHits }) => `
        <button type="button" class="rf-card" data-restaurant-id="${escapeHtml(r.id)}">
          ${restaurantLogoTile(r)}
          <span class="rf-card__main">
            <span class="rf-card__name">${escapeHtml(restaurantDisplayName(r))}</span>
            <span class="rf-card__tags">
              <span class="rf-tag">${escapeHtml(r.cuisine_type || 'Restaurant')}</span>
              <span class="rf-card__town"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(r._town)}</span>
            </span>
            ${dishHits.length ? `<span class="rf-card__dishes"><i class="fa-solid fa-utensils"></i> ${escapeHtml(dishHits.slice(0, 3).join(' · '))}</span>` : ''}
          </span>
          <span class="rf-card__side">
            ${km != null ? `<span class="rf-card__km">${km < 10 ? km.toFixed(1) : Math.round(km)} km</span>` : ''}
            ${fee != null ? `<span class="rf-card__fee">${peso(fee)} delivery</span>` : ''}
          </span>
          <i class="fa-solid fa-chevron-right rf-card__chev" aria-hidden="true"></i>
        </button>`).join('')
    : `<div class="rf-empty">
        <i class="fa-solid fa-magnifying-glass"></i>
        <strong>No matches</strong>
        <span>Try another town, category or dish.</span>
       </div>`;
}

function _stripFinderFields(r) {
  const { _town, _cats, ...rest } = r;
  return rest;
}
