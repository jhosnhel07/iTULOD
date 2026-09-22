/* map.js — Mapbox GL JS (maps + geocoding) */
const MAPBOX_TOKEN = 'pk.eyJ1IjoicmhhemUiLCJhIjoiY21ycnMxdGRiMHBpaDRhcXpqNzI3OWVyZCJ9.B3rQinx6_nBwZ4mySRdotQ';
const STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

// Kept as an alias so other scripts that still reference MAPTILER_KEY keep working.
const MAPTILER_KEY = MAPBOX_TOKEN;

const DEFAULT_CENTER = [120.5936, 18.1977]; // Laoag City
const DEFAULT_ZOOM = 13;

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
  return new mapboxgl.Map({
    container: containerId,
    style: STYLE,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
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
      + `&lat=${DEFAULT_CENTER[1]}&lon=${DEFAULT_CENTER[0]}`;
    const d = await (await fetch(url)).json();
    return (d.features || [])
      .filter(f => f.geometry && (f.properties || {}).countrycode === 'PH')
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
    map: null, markers: {}, mode: 'pickup',
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
};

function setMapMode(mode, tab) {
  const cfg = _maps[tab || 'ride'];
  cfg.mode = mode;
  const hint = document.getElementById(cfg.hintId);
  const btnP = document.getElementById(cfg.btnPickupId);
  const btnD = document.getElementById(cfg.btnDropoffId);

  if (hint) {
    hint.textContent = mode === 'pickup'
      ? 'Click on the map to set pickup location.'
      : 'Click on the map to set drop-off location.';
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

// Apply a chosen location (from a map click or a search result) to the tab's
// current mode: fill the matching address input, (re)drop the marker, and draw
// the route once both ends are set.
async function _setStop(tab, lngLat, address) {
  const cfg = _maps[tab];
  if (!address) address = await _reverseGeocode({ lng: lngLat[0], lat: lngLat[1] });
  if (cfg.mode === 'pickup') {
    const input = document.getElementById(cfg.pickupInputId);
    if (input) { input.value = address; input.dispatchEvent(new Event('input')); }
    if (cfg.markers.pickup) cfg.markers.pickup.remove();
    cfg.markers.pickup = _makeMarker(cfg.map, lngLat, '#22c55e', 'Pickup');
    setMapMode('dropoff', tab);
  } else {
    const input = document.getElementById(cfg.dropoffInputId);
    if (input) { input.value = address; input.dispatchEvent(new Event('input')); }
    if (cfg.markers.dropoff) cfg.markers.dropoff.remove();
    cfg.markers.dropoff = _makeMarker(cfg.map, lngLat, '#ef4444', 'Drop-off');
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
    placeholder: 'Search any place or address…',
    countries: 'ph',
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
    const d = await (await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${MAPBOX_TOKEN}&country=ph&limit=1`)).json();
    return d.features?.[0]?.center || null;
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
  if (_locWatchId != null) { navigator.geolocation.clearWatch(_locWatchId); _locWatchId = null; }
  clearTimeout(_locTimer);
  if (typeof supabase !== 'undefined' && typeof CURRENT_PROFILE !== 'undefined' && CURRENT_PROFILE?.id) {
    supabase.from('rider_locations').delete().eq('rider_id', CURRENT_PROFILE.id).then(() => {});
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

function goOffline() {
  if (_onlineWatchId != null) { navigator.geolocation.clearWatch(_onlineWatchId); _onlineWatchId = null; }
  if (typeof supabase !== 'undefined' && typeof CURRENT_PROFILE !== 'undefined' && CURRENT_PROFILE?.id) {
    supabase.from('rider_locations').update({ is_online: false }).eq('rider_id', CURRENT_PROFILE.id).then(() => {});
  }
}

/* ── Customer: "riders near you" markers on the ride booking map ──────────── */
let _nearbyRidersTimer = null;
let _nearbyRiderMarkers = [];

async function refreshNearbyRiders(tab) {
  const cfg = _maps[tab];
  if (!cfg || !cfg.map || typeof supabase === 'undefined') return;
  const { data, error } = await supabase.rpc('get_nearby_riders');
  if (error) { console.warn('get_nearby_riders failed:', error.message); return; }
  _nearbyRiderMarkers.forEach(m => m.remove());
  _nearbyRiderMarkers = (data || []).map(r => {
    const el = document.createElement('div');
    el.innerHTML = '<i class="fa-solid fa-motorcycle"></i>';
    el.style.cssText = 'color:#fff;background:#1a9d63;border-radius:50%;width:28px;height:28px;'
      + 'display:flex;align-items:center;justify-content:center;font-size:14px;'
      + 'box-shadow:0 2px 8px rgba(0,0,0,.3);border:2px solid #fff';
    return new mapboxgl.Marker({ element: el }).setLngLat([r.lng, r.lat]).addTo(cfg.map);
  });
  const countEl = document.getElementById('nearby-riders-count');
  if (countEl) {
    const label = (data && data.length)
      ? `${data.length} rider${data.length === 1 ? '' : 's'} nearby`
      : 'No riders online right now';
    countEl.innerHTML = `<i class="fa-solid fa-motorcycle"></i> ${label}`;
  }
}

function startNearbyRidersWatch(tab) {
  refreshNearbyRiders(tab);
  clearInterval(_nearbyRidersTimer);
  _nearbyRidersTimer = setInterval(() => refreshNearbyRiders(tab), 20000);
}

function stopNearbyRidersWatch() {
  clearInterval(_nearbyRidersTimer);
  _nearbyRidersTimer = null;
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
