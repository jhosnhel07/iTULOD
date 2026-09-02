/* map.js — Mapbox GL JS (maps + geocoding) */
const MAPBOX_TOKEN = 'pk.eyJ1IjoicmhhemUiLCJhIjoiY21ycnMxdGRiMHBpaDRhcXpqNzI3OWVyZCJ9.B3rQinx6_nBwZ4mySRdotQ';
const STYLE = 'mapbox://styles/mapbox/satellite-streets-v12';

// Kept as an alias so other scripts that still reference MAPTILER_KEY keep working.
const MAPTILER_KEY = MAPBOX_TOKEN;

mapboxgl.accessToken = MAPBOX_TOKEN;

const DEFAULT_CENTER = [120.5936, 18.1977]; // Laoag City
const DEFAULT_ZOOM = 13;

function _initMap(containerId) {
  return new mapboxgl.Map({
    container: containerId,
    style: STYLE,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
}

async function _reverseGeocode(lngLat) {
  const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lngLat.lng},${lngLat.lat}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
  const d = await r.json();
  return d.features?.[0]?.place_name || `${lngLat.lat.toFixed(5)}, ${lngLat.lng.toFixed(5)}`;
}

async function _drawRouteOnMap(map, sourceId, layerId, color, pickupLngLat, dropoffLngLat) {
  const url = `https://router.project-osrm.org/route/v1/driving/${pickupLngLat[0]},${pickupLngLat[1]};${dropoffLngLat[0]},${dropoffLngLat[1]}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const geom = data.routes?.[0]?.geometry;
    if (!geom) return;
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
  } catch (_) {}
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
    _drawRouteOnMap(cfg.map, cfg.routeSource, cfg.routeLayer, cfg.routeColor,
      cfg.markers.pickup.getLngLat().toArray(),
      cfg.markers.dropoff.getLngLat().toArray()
    );
  }
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
    placeholder: 'Search for a place…',
    countries: 'ph',
    proximity: { longitude: DEFAULT_CENTER[0], latitude: DEFAULT_CENTER[1] },
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
  try { navGeolocate.trigger(); } catch (_) {}
}

function _whenMapReady(map) {
  if (!map) return Promise.resolve();
  if (map.isStyleLoaded()) return Promise.resolve();
  return new Promise(resolve => map.once('load', resolve));
}

async function _geocodeAddress(addr) {
  const r = await fetch(`https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(addr)}.json?access_token=${MAPBOX_TOKEN}&limit=1`);
  const d = await r.json();
  return d.features?.[0]?.center || null;
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

function clearRiderRoute() {
  navRouteKey = null;
  Object.values(navMarkers).forEach(m => m.remove());
  navMarkers = {};
  try {
    if (navMap && navMap.getLayer('nav-route-line')) navMap.removeLayer('nav-route-line');
    if (navMap && navMap.getSource('nav-route')) navMap.removeSource('nav-route');
  } catch (_) {}
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

async function showBookingDetailsRoute(pickupAddr, dropoffAddr) {
  if (!bdMap) return;
  const [pickup, dropoff] = await Promise.all([_geocodeAddress(pickupAddr), _geocodeAddress(dropoffAddr)]);
  if (!pickup || !dropoff) return;
  [['pickup', pickup, '#22c55e', 'Pickup'], ['dropoff', dropoff, '#ef4444', 'Drop-off']].forEach(([id, lngLat, color, label]) => {
    if (bdMarkers[id]) bdMarkers[id].remove();
    bdMarkers[id] = _makeMarker(bdMap, lngLat, color, label);
  });
  await _drawRouteOnMap(bdMap, 'bd-route', 'bd-route-line', '#2196f3', pickup, dropoff);
}

function destroyBookingDetailsMap() {
  if (bdMap) { bdMap.remove(); bdMap = null; }
  bdMarkers = {};
}
