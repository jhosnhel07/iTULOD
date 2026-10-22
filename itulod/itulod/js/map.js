/* map.js — Mapbox GL JS (maps + geocoding) */
const MAPBOX_TOKEN = 'pk.eyJ1IjoicmhhemUiLCJhIjoiY21ycnMxdGRiMHBpaDRhcXpqNzI3OWVyZCJ9.B3rQinx6_nBwZ4mySRdotQ';
const STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

// Kept as an alias so other scripts that still reference MAPTILER_KEY keep working.
const MAPTILER_KEY = MAPBOX_TOKEN;

const DEFAULT_CENTER = [120.5936, 18.1977]; // Laoag City
const DEFAULT_ZOOM = 13;

/* ── Service area: Ilocos Norte only ─────────────────────────────────────
   Province border from OpenStreetMap (relation 1504744), simplified to about
   45 m. Pins, search results and booking addresses outside it are refused.
   The app has the same polygon in lib/core/constants/ilocos_norte.dart. */
const ILOCOS_NORTE_BOUNDARY = [ // [lng, lat]
  [120.26926,17.91548],[120.27047,17.89984],[120.2739,17.88218],[120.36999,17.86113],[120.40887,17.88196],[120.43425,17.89424],
  [120.44348,17.90125],[120.44323,17.90329],[120.44527,17.90513],[120.44626,17.90476],[120.44669,17.9028],[120.44767,17.90391],
  [120.44842,17.90279],[120.44983,17.90305],[120.45021,17.90123],[120.45268,17.9012],[120.45285,17.89971],[120.45399,17.89871],
  [120.45797,17.89824],[120.45793,17.89772],[120.45963,17.89724],[120.46012,17.89606],[120.46341,17.89595],[120.46464,17.89676],
  [120.46734,17.8959],[120.46903,17.89643],[120.48003,17.89182],[120.51718,17.88677],[120.52235,17.88465],[120.53028,17.87912],
  [120.53236,17.87704],[120.53398,17.87339],[120.53117,17.85309],[120.52881,17.84217],[120.5292,17.82907],[120.52793,17.8234],
  [120.57182,17.78603],[120.57396,17.78924],[120.58279,17.7991],[120.60222,17.80929],[120.61129,17.81111],[120.61591,17.81314],
  [120.62459,17.81463],[120.62755,17.8156],[120.63329,17.8191],[120.66031,17.82518],[120.66759,17.82755],[120.68185,17.83035],
  [120.69087,17.83458],[120.69846,17.84191],[120.70409,17.84848],[120.70825,17.85478],[120.71309,17.85996],[120.71785,17.87332],
  [120.72825,17.89251],[120.73639,17.89844],[120.74365,17.9014],[120.75553,17.90319],[120.76318,17.90614],[120.76998,17.90694],
  [120.7758,17.90923],[120.78375,17.91124],[120.80458,17.92943],[120.81006,17.93505],[120.81781,17.94375],[120.82604,17.95476],
  [120.83369,17.95945],[120.841,17.96147],[120.8502,17.96286],[120.86494,17.96152],[120.87938,17.95766],[120.89458,17.95147],
  [120.90399,17.94964],[120.90997,17.94992],[120.91506,17.95215],[120.92039,17.95626],[120.93209,17.97522],[120.9337,17.97638],
  [120.93772,17.9843],[120.94137,17.98794],[120.94384,17.98842],[120.94483,17.98944],[120.94701,17.99707],[120.94509,17.99647],
  [120.94399,17.99811],[120.94409,17.99983],[120.93931,18.00518],[120.9381,18.01236],[120.93663,18.01342],[120.93229,18.01382],
  [120.92779,18.02071],[120.92798,18.0231],[120.93341,18.0291],[120.93475,18.04408],[120.93587,18.04845],[120.93508,18.05288],
  [120.93303,18.05764],[120.93422,18.05944],[120.93548,18.06437],[120.93546,18.069],[120.92753,18.07858],[120.92814,18.08819],
  [120.93553,18.10641],[120.94456,18.12289],[120.94854,18.13261],[120.94803,18.13715],[120.94987,18.13976],[120.96192,18.16651],
  [120.97007,18.18186],[120.94317,18.21651],[120.93879,18.22089],[120.92676,18.24194],[120.91667,18.28457],[120.94836,18.38169],
  [120.94704,18.42063],[120.96565,18.44477],[120.96051,18.44573],[120.96125,18.44855],[120.95831,18.45557],[120.95891,18.4629],
  [120.96001,18.46552],[120.96054,18.47044],[120.95917,18.47898],[120.95911,18.49031],[120.96089,18.49542],[120.96012,18.5011],
  [120.96211,18.50389],[120.96464,18.51609],[120.96406,18.52401],[120.96814,18.53913],[120.96771,18.54262],[120.96857,18.54763],
  [120.96844,18.55137],[120.96724,18.55324],[120.96647,18.55867],[120.96836,18.56181],[120.96909,18.56795],[120.97078,18.57042],
  [120.97085,18.57296],[120.96882,18.57797],[120.94828,18.59061],[120.93297,18.60128],[120.93181,18.60945],[120.93499,18.64726],
  [120.94681,18.68744],[120.94944,18.6942],[120.9575,18.72081],[120.96109,18.73632],[120.94569,18.74982],[120.93133,18.76017],
  [120.91101,18.77147],[120.8922,18.779],[120.87413,18.78359],[120.85246,18.78606],[120.83319,18.78569],[120.8116,18.78265],
  [120.79451,18.77795],[120.7784,18.77139],[120.76522,18.76421],[120.74608,18.75841],[120.73374,18.75329],[120.72025,18.74628],
  [120.70895,18.73947],[120.69097,18.72584],[120.67909,18.71475],[120.66703,18.70035],[120.65938,18.68924],[120.65501,18.68173],
  [120.64014,18.68294],[120.62843,18.68284],[120.61685,18.68184],[120.59637,18.67846],[120.58464,18.67569],[120.57119,18.67123],
  [120.55776,18.66553],[120.54853,18.66064],[120.53078,18.64874],[120.5132,18.63319],[120.50301,18.6271],[120.49035,18.61796],
  [120.47792,18.60676],[120.46141,18.58874],[120.44308,18.56498],[120.43694,18.55498],[120.43161,18.54426],[120.4266,18.53146],
  [120.42229,18.51551],[120.42041,18.5033],[120.41966,18.49029],[120.42004,18.47874],[120.42117,18.46888],[120.42388,18.44963],
  [120.42679,18.437],[120.43008,18.4267],[120.43552,18.41371],[120.44164,18.40165],[120.44981,18.38826],[120.45311,18.38096],
  [120.45584,18.37254],[120.4567,18.36511],[120.44744,18.35251],[120.43932,18.33878],[120.43293,18.32425],[120.42929,18.31269],
  [120.42593,18.30441],[120.41665,18.29428],[120.40622,18.2805],[120.40054,18.2715],[120.39383,18.25878],[120.38295,18.23115],
  [120.37986,18.22101],[120.37676,18.20505],[120.37572,18.18805],[120.36432,18.17694],[120.3537,18.16386],[120.34513,18.15025],
  [120.33831,18.13577],[120.33225,18.11663],[120.32916,18.09676],[120.32879,18.08639],[120.32926,18.07552],[120.33065,18.06473],
  [120.33318,18.05328],[120.33174,18.03416],[120.31909,18.02454],[120.30475,18.01055],[120.29413,17.99704],[120.28511,17.9819],
  [120.27726,17.96369],[120.27299,17.9488],[120.26991,17.9311],[120.26926,17.91548],
];
// Bounding box of the border, and a padded box the maps can't be panned past.
const ILOCOS_NORTE_BBOX = [120.2692, 17.786, 120.9709, 18.7862]; // minLng, minLat, maxLng, maxLat
const ILOCOS_NORTE_MAX_BOUNDS = [[120.12, 17.66], [121.12, 18.92]];
const OUTSIDE_SERVICE_AREA_MSG = 'iTULOD only serves Ilocos Norte — please pick a spot inside the province.';

// Ray-casting point-in-polygon test.
function isInIlocosNorte(lng, lat) {
  if (lng == null || lat == null || isNaN(lng) || isNaN(lat)) return false;
  const [minLng, minLat, maxLng, maxLat] = ILOCOS_NORTE_BBOX;
  if (lng < minLng || lng > maxLng || lat < minLat || lat > maxLat) return false;
  let inside = false;
  const poly = ILOCOS_NORTE_BOUNDARY;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}


// Mapbox GL JS (~200 KB) + the geocoder plugin are loaded on demand — the
// first time a map is actually needed — not on every dashboard visit. The
// promise is cached so concurrent callers share one load.
const _MAPBOX_GL_VER = '3.9.0';
const _MAPBOX_GC_VER = 'v5.0.3';
let _mapboxLoad = null;
function loadMapbox() {
  if (typeof mapboxgl !== 'undefined') return Promise.resolve();
  if (_mapboxLoad) return _mapboxLoad;
  _mapboxLoad = new Promise((resolve, reject) => {
    const addLink = (href) => {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = href;
      document.head.appendChild(l);
    };
    const addScript = (src) => new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = res; s.onerror = () => rej(new Error('failed to load ' + src));
      document.head.appendChild(s);
    });
    addLink(`https://api.mapbox.com/mapbox-gl-js/v${_MAPBOX_GL_VER}/mapbox-gl.css`);
    addLink(`https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/${_MAPBOX_GC_VER}/mapbox-gl-geocoder.css`);
    addScript(`https://api.mapbox.com/mapbox-gl-js/v${_MAPBOX_GL_VER}/mapbox-gl.js`)
      .then(() => {
        mapboxgl.accessToken = MAPBOX_TOKEN;
        // The geocoder is optional — search still degrades gracefully without it.
        return addScript(`https://api.mapbox.com/mapbox-gl-js/plugins/mapbox-gl-geocoder/${_MAPBOX_GC_VER}/mapbox-gl-geocoder.min.js`).catch(() => {});
      })
      .then(resolve)
      .catch((err) => { _mapboxLoad = null; reject(err); });
  });
  return _mapboxLoad;
}

function _initMap(containerId) {
  mapboxgl.accessToken = MAPBOX_TOKEN;
  const map = new mapboxgl.Map({
    container: containerId,
    style: STYLE,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
    // Keep every map on Ilocos Norte — it can't be panned or zoomed out past it.
    maxBounds: ILOCOS_NORTE_MAX_BOUNDS,
    minZoom: 8,
  });
  _autoResize(map);
  return map;
}

// Maps built inside a hidden tab or a closed sheet get a 0×0 canvas and then
// show blank or half-drawn until something calls resize(). Watch the map's
// box and resize whenever it changes size (tab shown, sheet opened, window
// resized), so every map is always drawn edge to edge.
function _autoResize(map) {
  const el = map.getContainer();
  if (!el || typeof ResizeObserver === 'undefined') return;
  let queued = false;
  new ResizeObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (el.offsetWidth > 0 && el.offsetHeight > 0) map.resize();
    });
  }).observe(el);
}

/* ── Geocoding ────────────────────────────────────────────────────────────
   Mapbox's place/POI coverage in the Philippines is thin (it often returns
   roads in the wrong province for a business name), so search is backed by
   Photon — the OpenStreetMap geocoder, same data source as the OSRM routing.
   Photon is queried first and Mapbox is only a fallback. */
const PHOTON_URL = 'https://photon.komoot.io';

function _photonLabel(p) {
  const locality = p.city || p.locality || p.district || p.county;
  return [p.name, p.street, locality, p.state, 'Philippines']
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
}

// Photon results shaped as Carmen GeoJSON so the Mapbox geocoder control can
// list them. Filtered to the Philippines and biased toward Laoag.
async function _photonSearch(query) {
  if (!query || query.trim().length < 2) return [];
  try {
    const url = `${PHOTON_URL}/api/?q=${encodeURIComponent(query)}&lang=en&limit=8`
      + `&lat=${DEFAULT_CENTER[1]}&lon=${DEFAULT_CENTER[0]}`
      + `&bbox=${ILOCOS_NORTE_BBOX.join(',')}`;
    const d = await (await fetch(url)).json();
    return (d.features || [])
      .filter(f => f.geometry && (f.properties || {}).countrycode === 'PH')
      .filter(f => isInIlocosNorte(f.geometry.coordinates[0], f.geometry.coordinates[1]))
      .map(f => {
        const c = f.geometry.coordinates;
        const label = _photonLabel(f.properties);
        return {
          id: 'photon.' + (f.properties.osm_type || 'X') + (f.properties.osm_id || c.join('')),
          type: 'Feature',
          place_type: ['place'],
          text: f.properties.name || label,
          place_name: label,
          center: c,
          geometry: { type: 'Point', coordinates: c },
          properties: { source: 'photon' },
        };
      });
  } catch (err) {
    console.warn('Photon geocoder search failed:', err && err.message);
    return [];
  }
}

async function _reverseGeocode(lngLat) {
  try {
    const d = await (await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lngLat.lng},${lngLat.lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`)).json();
    if (d.features?.[0]?.place_name) return d.features[0].place_name;
  } catch (_) { /* fall through */ }
  try {
    const d = await (await fetch(`${PHOTON_URL}/reverse?lon=${lngLat.lng}&lat=${lngLat.lat}&lang=en`)).json();
    if (d.features?.[0]) return _photonLabel(d.features[0].properties);
  } catch (_) { /* fall through */ }
  return `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
}

// Draws the driving route through an ordered list of [lng,lat] waypoints
// (2 or more — a plain pickup/dropoff route is just the 2-waypoint case) and
// returns { km, min } for the real road distance/time, or null if OSRM is
// unreachable.
async function _drawRouteOnMapMulti(map, sourceId, layerId, color, waypoints) {
  const coordStr = waypoints.map(w => `${w[0]},${w[1]}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const route = data.routes?.[0];
    const geom = route?.geometry;
    if (!geom) return null;
    if (map.getSource(sourceId)) {
      map.getSource(sourceId).setData(geom);
    } else {
      map.addSource(sourceId, { type: 'geojson', data: geom });
      map.addLayer({ id: layerId, type: 'line', source: sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': color, 'line-width': 4, 'line-opacity': 0.85 },
      });
    }
    const coords = geom.coordinates;
    const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 50 });
    return { km: route.distance / 1000, min: route.duration / 60 };
  } catch (err) {
    console.warn('OSRM route draw failed:', err && err.message);
    return null;
  }
}

// Draws the driving route and returns { km, min } for the real road distance
// and time (or null if OSRM is unreachable).
async function _drawRouteOnMap(map, sourceId, layerId, color, pickupLngLat, dropoffLngLat) {
  return _drawRouteOnMapMulti(map, sourceId, layerId, color, [pickupLngLat, dropoffLngLat]);
}

// Geocode two address strings and ask OSRM for the driving distance/time
// between them. Used to price a booking from the typed addresses before the
// customer has pinned anything on the map. Returns
// { km, min, pickup:[lng,lat], dropoff:[lng,lat] } or null.
async function routeBetweenAddresses(pickupText, dropoffText) {
  if (!pickupText || !dropoffText) return null;
  try {
    const [p, d] = await Promise.all([
      _geocodeAddress(pickupText),
      _geocodeAddress(dropoffText),
    ]);
    if (!p || !d) return null;
    const url = `https://router.project-osrm.org/route/v1/driving/${p[0]},${p[1]};${d[0]},${d[1]}?overview=false`;
    const route = (await (await fetch(url)).json()).routes?.[0];
    if (!route) return null;
    return { km: route.distance / 1000, min: route.duration / 60, pickup: p, dropoff: d };
  } catch (err) {
    console.warn('routeBetweenAddresses failed — fare falls back to the estimate:', err && err.message);
    return null;
  }
}

// Same idea as routeBetweenAddresses but for pickup -> stop1 -> ... -> dropoff
// (a multi-stop ride). Returns the *total* distance/time across every leg in
// one OSRM request, plus each waypoint's [lng,lat] in order.
async function routeThroughWaypoints(addresses) {
  if (!addresses || addresses.length < 2) return null;
  try {
    const coords = await Promise.all(addresses.map(a => _geocodeAddress(a)));
    if (coords.some(c => !c)) return null;
    const coordStr = coords.map(c => `${c[0]},${c[1]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false`;
    const route = (await (await fetch(url)).json()).routes?.[0];
    if (!route) return null;
    return { km: route.distance / 1000, min: route.duration / 60, waypoints: coords };
  } catch (err) {
    console.warn('routeThroughWaypoints failed — fare falls back to the estimate:', err && err.message);
    return null;
  }
}

function _makeMarker(map, lngLat, color, label) {
  const el = document.createElement('div');
  // Same glyph as the "Set Pickup" button (Font Awesome fa-location-dot):
  // an inverted teardrop with a hole, tip at the bottom centre.
  el.innerHTML = '<i class="fa-solid fa-location-dot"></i>';
  el.style.cssText = `color:${color};font-size:28px;line-height:1;`
    + `filter:drop-shadow(0 0 2px #fff) drop-shadow(0 1px 3px rgba(0,0,0,.5));cursor:pointer`;
  // fa-location-dot's point sits at the bottom, so anchor the bottom to the coord
  const m = new mapboxgl.Marker({ element: el, anchor: 'bottom' }).setLngLat(lngLat);
  if (label) m.setPopup(new mapboxgl.Popup({ offset: 12 }).setText(label));
  m.addTo(map);
  return m;
}

/* ── Per-tab map state ──────────────────────────────────────────────────── */
// Each tab has: map instance, markers {pickup, dropoff}, mode, input IDs, hint/button IDs
const _maps = {
  ride: {
    map: null, markers: {}, mode: 'pickup',
    pickupInputId: 'ride-pickup', dropoffInputId: 'ride-destination',
    hintId: 'map-mode-hint', btnPickupId: 'map-mode-pickup', btnDropoffId: 'map-mode-dropoff',
    routeSource: 'route', routeLayer: 'route-line', routeColor: '#2196f3',
  },
  food: {
    // Pickup is auto-set from the chosen restaurant (see customer.js
    // updateFoodRestaurantSummary) — this map only ever sets the delivery
    // address, so it defaults straight to dropoff mode.
    map: null, markers: {}, mode: 'dropoff',
    pickupInputId: 'food-pickup', dropoffInputId: 'food-address',
    hintId: 'food-map-mode-hint', btnPickupId: 'food-map-mode-pickup', btnDropoffId: 'food-map-mode-dropoff',
    routeSource: 'food-route', routeLayer: 'food-route-line', routeColor: '#0d47a1',
  },
  parcel: {
    map: null, markers: {}, mode: 'pickup',
    pickupInputId: 'parcel-sender-address', dropoffInputId: 'parcel-receiver-address',
    hintId: 'parcel-map-mode-hint', btnPickupId: 'parcel-map-mode-pickup', btnDropoffId: 'parcel-map-mode-dropoff',
    routeSource: 'parcel-route', routeLayer: 'parcel-route-line', routeColor: '#1a9d63',
  },
  hauling: {
    map: null, markers: {}, mode: 'pickup',
    pickupInputId: 'hauling-pickup-address', dropoffInputId: 'hauling-dropoff-address',
    hintId: 'hauling-map-mode-hint', btnPickupId: 'hauling-map-mode-pickup', btnDropoffId: 'hauling-map-mode-dropoff',
    routeSource: 'hauling-route', routeLayer: 'hauling-route-line', routeColor: '#0d47a1',
  },
  saved: {
    map: null, markers: {}, mode: 'address',
    addressInputId: 'saved-address-text',
    hintId: 'saved-map-mode-hint', btnPickupId: null, btnDropoffId: null,
  },
};

function setMapMode(mode, tab) {
  const cfg = _maps[tab || 'ride'];
  cfg.mode = mode;
  const hint = document.getElementById(cfg.hintId);
  const btnP = document.getElementById(cfg.btnPickupId);
  const btnD = document.getElementById(cfg.btnDropoffId);

  if (hint) {
    if (mode === 'address') {
      hint.textContent = 'Click on the map to set address.';
    } else {
      hint.textContent = mode === 'pickup'
        ? 'Click on the map to set pickup location.'
        : 'Click on the map to set drop-off location.';
    }
  }

  if (btnP) {
    btnP.classList.toggle('active', mode === 'pickup');
    btnP.classList.toggle('done', mode === 'dropoff');
    btnP.setAttribute('aria-pressed', mode === 'pickup' ? 'true' : 'false');
  }

  if (btnD) {
    btnD.classList.toggle('active', mode === 'dropoff');
    btnD.classList.toggle('done', mode === 'pickup');
    btnD.setAttribute('aria-pressed', mode === 'dropoff' ? 'true' : 'false');
  }
}

function getMapMarkerLngLat(tab, mode) {
  const cfg = _maps[tab];
  if (!cfg || !cfg.markers[mode]) return null;
  const ll = cfg.markers[mode].getLngLat();
  return [ll.lng, ll.lat];
}

// Apply a chosen location (from a map click or a search result) to the tab's
// current mode: fill the matching address input, (re)drop the marker, and draw
// the route once both ends are set.
async function _setStop(tab, lngLat, address) {
  const cfg = _maps[tab];
  if (!isInIlocosNorte(lngLat[0], lngLat[1])) {
    if (typeof toast === 'function') toast(OUTSIDE_SERVICE_AREA_MSG, 'error');
    return;
  }
  if (!address) address = await _reverseGeocode({ lng: lngLat[0], lat: lngLat[1] });
  if (cfg.mode === 'pickup') {
    const input = document.getElementById(cfg.pickupInputId);
    if (input) { input.value = address; input.dispatchEvent(new Event('input')); }
    if (cfg.markers.pickup) cfg.markers.pickup.remove();
    cfg.markers.pickup = _makeMarker(cfg.map, lngLat, '#22c55e', 'Pickup');
    setMapMode('dropoff', tab);
  } else if (cfg.mode === 'dropoff') {
    const input = document.getElementById(cfg.dropoffInputId);
    if (input) { input.value = address; input.dispatchEvent(new Event('input')); }
    if (cfg.markers.dropoff) cfg.markers.dropoff.remove();
    cfg.markers.dropoff = _makeMarker(cfg.map, lngLat, '#ef4444', 'Drop-off');
  } else if (cfg.mode === 'address') {
    const input = document.getElementById(cfg.addressInputId);
    if (input) { input.value = address; input.dispatchEvent(new Event('input')); }
    if (cfg.markers.address) cfg.markers.address.remove();
    cfg.markers.address = _makeMarker(cfg.map, lngLat, '#f59e0b', 'Address');
  }
  if (cfg.markers.pickup && cfg.markers.dropoff) {
    const p = cfg.markers.pickup.getLngLat().toArray();
    const d = cfg.markers.dropoff.getLngLat().toArray();
    _drawRouteOnMap(cfg.map, cfg.routeSource, cfg.routeLayer, cfg.routeColor, p, d)
      .then(route => {
        if (route && typeof cfg.onRoute === 'function') {
          cfg.onRoute({ km: route.km, min: route.min, pickup: p, dropoff: d });
        }
      });
  }
}

// The customer form registers a callback here so the fare updates the moment
// a real route is known (from pinning both points on the map).
function onBookingRoute(tab, cb) {
  if (_maps[tab]) _maps[tab].onRoute = cb;
}

function _wireMapClick(tab) {
  const cfg = _maps[tab];
  cfg.map.getCanvas().style.cursor = 'crosshair';
  cfg.map.on('click', (e) => _setStop(tab, [e.lngLat.lng, e.lngLat.lat]));
}

// Base Mapbox search box. When `onResult` is given it receives ([lng,lat],
// place_name) as the user picks a suggestion (used to fill booking inputs); when
// omitted the control just flies there and shows its own marker (read-only maps).
function _makeGeocoder(onResult) {
  if (typeof MapboxGeocoder === 'undefined') return null;
  const geocoder = new MapboxGeocoder({
    accessToken: MAPBOX_TOKEN,
    mapboxgl: mapboxgl,
    marker: !onResult,
    collapsed: true,
    limit: 8,
    language: 'en',
    placeholder: 'Search a place in Ilocos Norte…',
    countries: 'ph',
    bbox: ILOCOS_NORTE_BBOX,
    proximity: { longitude: DEFAULT_CENTER[0], latitude: DEFAULT_CENTER[1] },
    // OpenStreetMap results (rich PH coverage) are prepended to Mapbox's.
    externalGeocoder: (query) => _photonSearch(query),
  });
  if (onResult) {
    geocoder.on('result', (e) => {
      const c = e.result.center; // [lng, lat]
      onResult([c[0], c[1]], e.result.place_name);
    });
  }
  return geocoder;
}

// Booking maps: picking a search result sets the current mode's pickup/drop-off,
// exactly like clicking the map.
function _addGeocoder(tab) {
  const cfg = _maps[tab];
  const geocoder = _makeGeocoder((lngLat, name) => _setStop(tab, lngLat, name));
  if (geocoder) cfg.map.addControl(geocoder, 'top-left');
}

// Read-only maps (rider navigation, booking-details preview): search just pans
// the map to the place without touching any form or route.
function _addSearchControl(map) {
  const geocoder = _makeGeocoder();
  if (geocoder) map.addControl(geocoder, 'top-left');
}

// Where a typed address really is — searched across the whole Philippines
// (nearest-to-Laoag first), so an address outside the province is found and
// can be refused instead of silently matching nothing.
async function _locateAnywhereInPH(addr) {
  if (!addr || addr.trim().length < 3) return null;
  try {
    const url = `${PHOTON_URL}/api/?q=${encodeURIComponent(addr)}&lang=en&limit=1`
      + `&lat=${DEFAULT_CENTER[1]}&lon=${DEFAULT_CENTER[0]}`;
    const f = ((await (await fetch(url)).json()).features || [])
      .find(x => x.geometry && (x.properties || {}).countrycode === 'PH');
    return f ? f.geometry.coordinates : null;
  } catch (_) {
    return null;
  }
}

// Booking/saved-address submit guard. Each item is { label, address, coords? }
// where coords ([lng, lat]) is the pinned spot when there is one. Returns
// true when every place is in Ilocos Norte (or can't be located — a barangay
// name the geocoder doesn't know is allowed through; the rider confirms it).
async function checkServiceArea(items) {
  for (const it of items) {
    if (!it || !it.address) continue;
    const c = it.coords || await _locateAnywhereInPH(it.address);
    if (c && !isInIlocosNorte(c[0], c[1])) {
      if (typeof toast === 'function') {
        toast(`${it.label} looks like it's outside Ilocos Norte. iTULOD only serves Ilocos Norte.`, 'error');
      }
      return false;
    }
  }
  return true;
}

/* ── Public init functions ──────────────────────────────────────────────── */
function initTrackingMap(containerId) {
  _maps.ride.map = _initMap(containerId);
  _maps.ride.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  _addGeocoder('ride');
  _wireMapClick('ride');
  return _maps.ride.map;
}

function initFoodMap(containerId) {
  _maps.food.map = _initMap(containerId);
  _maps.food.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  _addGeocoder('food');
  _wireMapClick('food');
  return _maps.food.map;
}

function initParcelMap(containerId) {
  _maps.parcel.map = _initMap(containerId);
  _maps.parcel.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  _addGeocoder('parcel');
  _wireMapClick('parcel');
  return _maps.parcel.map;
}

function initHaulingMap(containerId) {
  _maps.hauling.map = _initMap(containerId);
  _maps.hauling.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  _addGeocoder('hauling');
  _wireMapClick('hauling');
  return _maps.hauling.map;
}

function initSavedMap(containerId) {
  _maps.saved.map = _initMap(containerId);
  _maps.saved.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
  _addGeocoder('saved');
  _wireMapClick('saved');
  return _maps.saved.map;
}

// The food and parcel maps are created while their tab is hidden (display:none),
// so Mapbox sizes their canvas to 0x0 and they render tiny. Call this once the
// tab becomes visible so the map fills its 420px container like the ride map.
function resizeBookingMap(tab) {
  const cfg = _maps[tab];
  if (cfg && cfg.map) cfg.map.resize();
}

// Below this width the booking map is pulled out of the page flow and only
// shown as a full-screen sheet when the user asks for it.
const MOBILE_MAP_MQ = '(max-width: 960px)';

// Creates the three customer booking maps once Mapbox GL has loaded. Called
// the first time the New booking tab is shown, or when a "set on map" button
// is tapped. Cached so it only runs once.
let _bookingMapsPromise = null;
function ensureBookingMaps() {
  if (_bookingMapsPromise) return _bookingMapsPromise;
  _bookingMapsPromise = loadMapbox()
    .then(() => {
      if (document.getElementById('tracking-map')) initTrackingMap('tracking-map');
      if (document.getElementById('food-map')) initFoodMap('food-map');
      if (document.getElementById('parcel-map')) initParcelMap('parcel-map');
      if (document.getElementById('hauling-map')) initHaulingMap('hauling-map');
      if (document.getElementById('saved-map')) initSavedMap('saved-map');
    })
    .catch((err) => {
      _bookingMapsPromise = null; // let a later attempt retry
      console.error('Booking maps failed to load:', err);
    });
  return _bookingMapsPromise;
}

// Called by the "set on map" button inside an address field: point the map at
// the right pickup/drop-off mode, then either open it as a sheet (phones, where
// the map card is hidden) or scroll it into view (desktop, map beside the form).
async function pinOnMap(tab, mode) {
  await ensureBookingMaps();
  setMapMode(mode, tab);
  const cfg = _maps[tab];
  const container = cfg && cfg.map && cfg.map.getContainer();
  if (!container) return;
  const card = container.closest('.map-card') || container;

  if (window.matchMedia(MOBILE_MAP_MQ).matches && card.classList.contains('map-card--picker')) {
    card.classList.add('map-sheet-open');
    document.body.classList.add('map-sheet-lock');
    card.scrollTop = 0;
    // the card was display:none, so Mapbox sized its canvas to 0×0 — resize it
    // now that it's on screen (twice: once next frame, once after the transition)
    requestAnimationFrame(() => cfg.map.resize());
    setTimeout(() => cfg.map.resize(), 260);
  } else {
    cfg.map.resize();
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('map-card--flash');
    setTimeout(() => card.classList.remove('map-card--flash'), 1200);
  }
}

// Close the mobile map sheet (the Done / ✕ buttons, and Escape).
function closeMapSheet(tab) {
  const cfg = tab && _maps[tab];
  const container = cfg && cfg.map && cfg.map.getContainer();
  const card = container && container.closest('.map-card');
  if (card) card.classList.remove('map-sheet-open');
  else document.querySelectorAll('.map-card--picker.map-sheet-open')
    .forEach(c => c.classList.remove('map-sheet-open'));
  if (!document.querySelector('.map-card--picker.map-sheet-open')) {
    document.body.classList.remove('map-sheet-lock');
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.querySelector('.map-card--picker.map-sheet-open')) {
    closeMapSheet();
  }
});

/* ── Kept for backward-compat (ride form submit geocodes & draws route) ── */
function setTrackingMarker(id, lngLat, color, label) {
  const cfg = _maps.ride;
  if (!cfg.map) return;
  if (cfg.markers[id]) cfg.markers[id].remove();
  cfg.markers[id] = _makeMarker(cfg.map, lngLat, color, label);
}

async function drawRoute(pickupLngLat, dropoffLngLat) {
  const cfg = _maps.ride;
  if (!cfg.map) return;
  await _drawRouteOnMap(cfg.map, cfg.routeSource, cfg.routeLayer, cfg.routeColor, pickupLngLat, dropoffLngLat);
}

/* ── Rider: navigation map ──────────────────────────────────────────────── */
let navMap = null;
let navMarkers = {};
let navGeolocate = null;
let navGeolocateTriggered = false;
let navRouteKey = null;

function initNavigationMap(containerId) {
  navMap = _initMap(containerId);
  navMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
  navGeolocate = new mapboxgl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  });
  navMap.addControl(navGeolocate, 'top-right');
  _addSearchControl(navMap);
  return navMap;
}

// Starts live GPS tracking (asks for location permission the first time).
// Only called once there's an actual accepted booking to navigate, not on
// every dashboard visit, so riders aren't prompted for location up front.
function startLiveLocationTracking() {
  if (!navGeolocate || navGeolocateTriggered) return;
  navGeolocateTriggered = true;
  try { navGeolocate.trigger(); } catch (err) { console.debug('Geolocate control not ready:', err && err.message); }
}

function _whenMapReady(map) {
  if (!map) return Promise.resolve();
  if (map.isStyleLoaded()) return Promise.resolve();
  return new Promise(resolve => map.once('load', resolve));
}

async function _geocodeAddress(addr) {
  // Photon (OpenStreetMap) first — far better local coverage — Mapbox as backup.
  const ph = await _photonSearch(addr);
  if (ph[0]) return ph[0].center;
  try {
    const d = await (await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${MAPBOX_TOKEN}&country=ph&bbox=${ILOCOS_NORTE_BBOX.join(',')}&limit=1`)).json();
    const c = d.features?.[0]?.center;
    return c && isInIlocosNorte(c[0], c[1]) ? c : null;
  } catch (err) {
    console.warn('Mapbox geocode fallback failed:', err && err.message);
    return null;
  }
}

async function showRiderRoute(pickupAddr, dropoffAddr) {
  if (!navMap) return;
  const key = pickupAddr + '|' + dropoffAddr;
  if (key === navRouteKey) return; // already showing this route — skip re-geocoding
  await _whenMapReady(navMap);
  startLiveLocationTracking();
  const [pickup, dropoff] = await Promise.all([_geocodeAddress(pickupAddr), _geocodeAddress(dropoffAddr)]);
  if (!pickup || !dropoff) return;
  navRouteKey = key;
  [['pickup', pickup, '#22c55e', 'Pickup'], ['dropoff', dropoff, '#ef4444', 'Drop-off']].forEach(([id, lngLat, color, label]) => {
    if (navMarkers[id]) navMarkers[id].remove();
    navMarkers[id] = _makeMarker(navMap, lngLat, color, label);
  });
  await _drawRouteOnMap(navMap, 'nav-route', 'nav-route-line', '#2196f3', pickup, dropoff);
}

// The nav map is initialized while its tab is hidden (display:none), so
// Mapbox GL sizes its canvas to 0x0. Call this after the tab becomes visible
// so the map actually renders instead of staying blank.
function resizeNavigationMap() {
  if (navMap) navMap.resize();
}

/* ── Live rider tracking ────────────────────────────────────────────────────
   Rider side: push our GPS to rider_locations every ~12s while on a job.
   Customer side: subscribe to that row and move a marker on the details map. */
let _locWatchId = null;
let _locTimer = null;
let _locLast = 0;

function startLocationBroadcast(bookingType, bookingId) {
  if (!('geolocation' in navigator) || typeof supabase === 'undefined') return;
  if (_locWatchId != null) return; // already running
  const push = (pos) => {
    const now = Date.now();
    if (now - _locLast < 10000) return;     // throttle to ~1 write / 10s
    _locLast = now;
    supabase.from('rider_locations').upsert({
      rider_id: (typeof CURRENT_PROFILE !== 'undefined' && CURRENT_PROFILE?.id) || null,
      booking_type: bookingType || null,
      booking_id: bookingId || null,
      lat: Number(pos.coords.latitude.toFixed(6)),
      lng: Number(pos.coords.longitude.toFixed(6)),
      heading: pos.coords.heading != null ? Number(pos.coords.heading.toFixed(1)) : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'rider_id' }).then(() => {});
  };
  _locWatchId = navigator.geolocation.watchPosition(push, () => {}, {
    enableHighAccuracy: true, maximumAge: 8000, timeout: 15000,
  });
}

function stopLocationBroadcast() {
  const wasTracking = _locWatchId != null;
  if (_locWatchId != null) { navigator.geolocation.clearWatch(_locWatchId); _locWatchId = null; }
  clearTimeout(_locTimer);
  // Trip over: drop the booking tag but keep the row — deleting it also wiped
  // is_online, knocking an online rider offline (and, with online status
  // synced to the app, switching the phone offline too).
  if (wasTracking && typeof supabase !== 'undefined' && typeof CURRENT_PROFILE !== 'undefined' && CURRENT_PROFILE?.id) {
    supabase.from('rider_locations').update({ booking_type: null, booking_id: null }).eq('rider_id', CURRENT_PROFILE.id).then(() => {});
  }
}

/* ── "Riders near you" presence ─────────────────────────────────────────────
   A separate, lighter-weight broadcast from the one above: this runs
   whenever a rider is toggled online, independent of any specific job, so
   customers can see roughly how many riders are around before they book
   (see sql/017_nearby_riders.sql — get_nearby_riders() rounds the coordinates
   and excludes anyone already on a job). Kept as its own watchPosition
   rather than reusing startLocationBroadcast/stopLocationBroadcast above,
   since those are tied to a specific booking and get deleted the moment a
   trip ends — this one needs to keep running across jobs. */
let _onlineWatchId = null;
let _onlineLast = 0;

function goOnline(onError) {
  if (!('geolocation' in navigator) || typeof supabase === 'undefined') { onError?.(); return; }
  if (_onlineWatchId != null) return; // already running
  const push = (pos) => {
    const now = Date.now();
    if (now - _onlineLast < 20000) return; // ~1 write / 20s — idle presence, not active-trip tracking
    _onlineLast = now;
    supabase.from('rider_locations').upsert({
      rider_id: (typeof CURRENT_PROFILE !== 'undefined' && CURRENT_PROFILE?.id) || null,
      lat: Number(pos.coords.latitude.toFixed(6)),
      lng: Number(pos.coords.longitude.toFixed(6)),
      is_online: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'rider_id' }).then(() => {});
  };
  _onlineWatchId = navigator.geolocation.watchPosition(push, () => {
    if (_onlineWatchId != null) { navigator.geolocation.clearWatch(_onlineWatchId); _onlineWatchId = null; }
    onError?.();
  }, {
    enableHighAccuracy: false, maximumAge: 15000, timeout: 20000,
  });
}

// Stop sending presence from this device without marking the rider offline
// — used when the rider went offline on another device (it already did).
function stopOnlinePresence() {
  if (_onlineWatchId != null) { navigator.geolocation.clearWatch(_onlineWatchId); _onlineWatchId = null; }
}

function goOffline() {
  if (_onlineWatchId != null) { navigator.geolocation.clearWatch(_onlineWatchId); _onlineWatchId = null; }
  if (typeof supabase !== 'undefined' && typeof CURRENT_PROFILE !== 'undefined' && CURRENT_PROFILE?.id) {
    supabase.from('rider_locations').update({ is_online: false }).eq('rider_id', CURRENT_PROFILE.id).then(() => {});
  }
}

/* ── Customer: "riders near you" markers on the booking maps ────────────── */
// Every booking form (ride, food, parcel, hauling) shows the online, idle
// drivers from get_nearby_riders() — only those with the vehicle the customer
// picked, and only within NEARBY_RADIUS_KM of the pickup (the restaurant, for
// food). The app's RidersNearYouMap does the same.
const NEARBY_RADIUS_KM = 10;
const HAULING_RIDER_TYPES = ['Van', 'Pickup', 'Truck'];
const NEARBY_VEHICLES = {
  Motorcycle: { icon: '<i class="fa-solid fa-motorcycle"></i>', one: 'motorcycle', many: 'motorcycles' },
  Tricycle:   { icon: '<i class="fa-solid fa-tricycle"></i>', one: 'tricycle', many: 'tricycles' },
  Car:        { icon: '<i class="fa-solid fa-car"></i>', one: 'car', many: 'cars' },
  SUV:        { icon: '<i class="fa-solid fa-car-side"></i>', one: 'SUV', many: 'SUVs' },
  Van:        { icon: '<i class="fa-solid fa-van-shuttle"></i>', one: 'van', many: 'vans' },
  Pickup:     { icon: '<i class="fa-solid fa-truck-pickup"></i>', one: 'pickup', many: 'pickups' },
  Truck:      { icon: '<i class="fa-solid fa-truck"></i>', one: 'truck', many: 'trucks' },
  Bicycle:    { icon: '<i class="fa-solid fa-bicycle"></i>', one: 'bicycle', many: 'bicycles' },
  Jeepney:    { icon: '<i class="fa-solid fa-bus-simple"></i>', one: 'jeepney', many: 'jeepneys' },
  Bus:        { icon: '<i class="fa-solid fa-bus"></i>', one: 'bus', many: 'buses' },
};

// Booking vehicle name (vehicles.name) → rider vehicle type
// (rider_applications.vehicle_type). Standard names match one to one; the
// hauling ones are descriptive ("L300 Van", "6-Wheeler Truck").
function riderTypeForVehicle(name) {
  if (!name) return null;
  if (NEARBY_VEHICLES[name]) return name;
  const n = name.toLowerCase();
  if (n.includes('pickup') || n.includes('multicab')) return 'Pickup';
  if (n.includes('truck') || n.includes('wheeler')) return 'Truck';
  if (n.includes('van')) return 'Van';
  if (n.includes('suv')) return 'SUV';
  if (n.includes('tricycle') || n.includes('trike')) return 'Tricycle';
  if (n.includes('motor')) return 'Motorcycle';
  if (n.includes('bicycle') || n.includes('bike')) return 'Bicycle';
  if (n.includes('jeep')) return 'Jeepney';
  if (n.includes('bus')) return 'Bus';
  if (n.includes('car') || n.includes('sedan')) return 'Car';
  return name;
}

function _kmBetween([lng1, lat1], [lng2, lat2]) {
  const rad = (d) => d * Math.PI / 180;
  const dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

let _nearbyRidersTimer = null;
let _nearbyRiderMarkers = [];
let _nearbyRidersTab = null;
let _nearbyRidersData = null;
const _nearbyWired = {};

// Which rider vehicle types this tab's form is asking for right now.
function _nearbyVehicleFilter(tab) {
  const sel = document.getElementById(`${tab}-vehicle`);
  const list = tab === 'hauling'
    ? (typeof HAULING_VEHICLES !== 'undefined' ? HAULING_VEHICLES : [])
    : (typeof VEHICLES !== 'undefined' ? VEHICLES : []);
  const vehicle = sel && list.find(v => v.id === sel.value);
  const type = vehicle ? riderTypeForVehicle(vehicle.name) : null;
  if (type) return { types: [type], type };
  return { types: tab === 'hauling' ? HAULING_RIDER_TYPES : null, type: null };
}

// Where "nearby" is measured from: the pinned pickup, or the restaurant.
function _nearbyOrigin(tab) {
  if (tab === 'food') {
    return (typeof FOOD_CART !== 'undefined' && FOOD_CART.restaurantPoint) || null;
  }
  return getMapMarkerLngLat(tab, 'pickup');
}

function renderNearbyRiders(tab) {
  const cfg = _maps[tab];
  if (!cfg || !cfg.map || !_nearbyRidersData) return;
  const { types, type } = _nearbyVehicleFilter(tab);
  const origin = _nearbyOrigin(tab);
  const shown = _nearbyRidersData.filter(r =>
    (!types || types.includes(r.vehicle_type)) &&
    (!origin || _kmBetween(origin, [r.lng, r.lat]) <= NEARBY_RADIUS_KM));

  _nearbyRiderMarkers.forEach(m => m.remove());
  _nearbyRiderMarkers = shown.map(r => {
    const v = NEARBY_VEHICLES[r.vehicle_type];
    const el = document.createElement('div');
    el.className = 'nearby-rider-pin';
    el.innerHTML = v ? v.icon : NEARBY_VEHICLES.Motorcycle.icon;
    el.title = `${r.vehicle_type || 'Rider'} driver — online`;
    return new mapboxgl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(cfg.map);
  });

  const countEl = document.getElementById(`nearby-riders-count-${tab}`);
  if (!countEl) return;
  const n = shown.length;
  const v = type && NEARBY_VEHICLES[type];
  const fallback = tab === 'hauling'
    ? { icon: '<i class="fa-solid fa-truck-moving"></i>', one: 'hauling driver', many: 'hauling drivers' }
    : { icon: '<i class="fa-solid fa-motorcycle"></i>', one: 'driver', many: 'drivers' };
  const kind = v || (type ? { icon: fallback.icon, one: `${type} driver`, many: `${type} drivers` } : fallback);
  const noun = n === 1 ? kind.one : kind.many;
  const from = tab === 'food' ? 'the restaurant' : 'your pickup';
  let label;
  if (origin) {
    label = n
      ? `<strong>${n} ${noun}</strong> within ${NEARBY_RADIUS_KM} km of ${from}`
      : `No ${kind.many} within ${NEARBY_RADIUS_KM} km of ${from} right now`;
  } else {
    const hint = tab === 'food' ? 'choose a restaurant' : 'set your pickup';
    label = n
      ? `<strong>${n} ${noun}</strong> online — ${hint} to see who's near`
      : `No ${kind.many} online right now`;
  }
  countEl.innerHTML = `${kind.icon} ${label}`;
}

async function refreshNearbyRiders(tab) {
  if (typeof supabase === 'undefined') return;
  const { data, error } = await supabase.rpc('get_nearby_riders');
  if (error) { console.warn('get_nearby_riders failed:', error.message); return; }
  _nearbyRidersData = data || [];
  if (_nearbyRidersTab === tab) renderNearbyRiders(tab);
}

// Re-draw (without refetching) when the vehicle or the pickup changes.
function _wireNearbyRiders(tab) {
  if (_nearbyWired[tab]) return;
  _nearbyWired[tab] = true;
  const rerender = () => setTimeout(() => { if (_nearbyRidersTab === tab) renderNearbyRiders(tab); }, 0);
  document.getElementById(`${tab}-vehicle`)?.addEventListener('change', rerender);
  const pickupId = _maps[tab]?.pickupInputId;
  if (pickupId) document.getElementById(pickupId)?.addEventListener('input', rerender);
}

function startNearbyRidersWatch(tab) {
  if (_nearbyRidersTab !== tab) {
    _nearbyRiderMarkers.forEach(m => m.remove());
    _nearbyRiderMarkers = [];
  }
  _nearbyRidersTab = tab;
  _wireNearbyRiders(tab);
  renderNearbyRiders(tab);
  refreshNearbyRiders(tab);
  clearInterval(_nearbyRidersTimer);
  _nearbyRidersTimer = setInterval(() => refreshNearbyRiders(tab), 20000);
}

function stopNearbyRidersWatch() {
  clearInterval(_nearbyRidersTimer);
  _nearbyRidersTimer = null;
  _nearbyRidersTab = null;
  _nearbyRiderMarkers.forEach(m => m.remove());
  _nearbyRiderMarkers = [];
}

let _trackChannel = null;
let _trackMarker = null;

async function trackRiderOnBookingMap(riderId, status, pickupAddr, dropoffAddr) {
  stopTrackingRider();
  const map = typeof bdMap !== 'undefined' ? bdMap : null;
  if (!map) return;

  // target = pickup while the rider is en-route, drop-off once the trip started
  const targetAddr = status === 'ongoing' ? dropoffAddr : pickupAddr;
  const target = await _geocodeAddress(targetAddr);

  const render = async (loc) => {
    if (!loc || loc.lat == null) return;
    const lngLat = [Number(loc.lng), Number(loc.lat)];
    if (!_trackMarker) {
      const el = document.createElement('div');
      el.innerHTML = '<i class="fa-solid fa-motorcycle"></i>';
      el.style.cssText = 'color:#0d47a1;font-size:20px;background:#fff;border-radius:50%;'
        + 'width:34px;height:34px;display:flex;align-items:center;justify-content:center;'
        + 'box-shadow:0 2px 10px rgba(13,71,161,.4)';
      _trackMarker = new mapboxgl.Marker({ element: el }).setLngLat(lngLat).addTo(map);
    } else {
      _trackMarker.setLngLat(lngLat);
    }
    if (target) {
      const eta = await _etaMinutes(lngLat, target);
      const el = document.getElementById('bd-eta');
      if (el && eta != null) {
        el.textContent = `Rider ~${Math.max(1, Math.round(eta))} min away`;
        el.hidden = false;
      }
    }
  };

  const { data } = await supabase.from('rider_locations').select('*').eq('rider_id', riderId).maybeSingle();
  if (data) render(data);

  _trackChannel = supabase.channel('track-' + riderId)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'rider_locations', filter: `rider_id=eq.${riderId}` },
      (payload) => render(payload.new))
    .subscribe();
}

function stopTrackingRider() {
  if (_trackChannel && typeof supabase !== 'undefined') { supabase.removeChannel(_trackChannel); _trackChannel = null; }
  if (_trackMarker) { _trackMarker.remove(); _trackMarker = null; }
}

async function _etaMinutes(fromLngLat, toLngLat) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLngLat[0]},${fromLngLat[1]};${toLngLat[0]},${toLngLat[1]}?overview=false`;
    const r = (await (await fetch(url)).json()).routes?.[0];
    return r ? r.duration / 60 : null;
  } catch (err) {
    console.warn('ETA lookup failed:', err && err.message);
    return null;
  }
}

function clearRiderRoute() {
  navRouteKey = null;
  Object.values(navMarkers).forEach(m => m.remove());
  navMarkers = {};
  try {
    if (navMap && navMap.getLayer('nav-route-line')) navMap.removeLayer('nav-route-line');
    if (navMap && navMap.getSource('nav-route')) navMap.removeSource('nav-route');
  } catch (err) { console.debug('nav route cleanup skipped:', err && err.message); }
}

/* ── Booking details modal: small read-only route map ──────────────────── */
let bdMap = null;
let bdMarkers = {};

function initBookingDetailsMap(containerId) {
  destroyBookingDetailsMap();
  bdMap = _initMap(containerId);
  bdMap.addControl(new mapboxgl.NavigationControl(), 'top-right');
  bdMap.scrollZoom.disable();
  _addSearchControl(bdMap);
  return bdMap;
}

async function showBookingDetailsRoute(pickupAddr, dropoffAddr, stopAddrs = []) {
  if (!bdMap) return;
  await _whenMapReady(bdMap);
  const allAddrs = [pickupAddr, ...stopAddrs, dropoffAddr];
  const coords = await Promise.all(allAddrs.map(a => _geocodeAddress(a)));
  if (coords.some(c => !c) || !bdMap) return;
  const [pickup, ...rest] = coords;
  const dropoff = rest[rest.length - 1];
  const stopCoords = rest.slice(0, -1);

  Object.values(bdMarkers).forEach(m => m.remove());
  bdMarkers = {};
  bdMarkers.pickup = _makeMarker(bdMap, pickup, '#22c55e', 'Pickup');
  stopCoords.forEach((c, i) => { bdMarkers[`stop${i}`] = _makeMarker(bdMap, c, '#f59e0b', `Stop ${i + 1}`); });
  bdMarkers.dropoff = _makeMarker(bdMap, dropoff, '#ef4444', 'Drop-off');

  // Frame every point first, then _drawRouteOnMapMulti refines the fit to the
  // path (and this stays put if the routing service is unavailable).
  const bounds = coords.reduce((b, c) => b.extend(c), new mapboxgl.LngLatBounds(coords[0], coords[0]));
  bdMap.fitBounds(bounds, { padding: 56, maxZoom: 15, duration: 0 });
  await _drawRouteOnMapMulti(bdMap, 'bd-route', 'bd-route-line', '#2196f3', coords);
}

function destroyBookingDetailsMap() {
  if (bdMap) { bdMap.remove(); bdMap = null; }
  bdMarkers = {};
}
