/* map.js — MapTiler + OpenStreetMap via MapLibre GL JS */
const MAPTILER_KEY = '4L25FygYQ7ujnymqdVQT';
const STYLE = `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;

const DEFAULT_CENTER = [120.5936, 18.1977]; // Laoag City
const DEFAULT_ZOOM = 13;

function _initMap(containerId) {
  return new maplibregl.Map({
    container: containerId,
    style: STYLE,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: true,
  });
}

async function _reverseGeocode(lngLat) {
  const r = await fetch(`https://api.maptiler.com/geocoding/${lngLat.lng},${lngLat.lat}.json?key=${MAPTILER_KEY}&limit=1`);
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
    const bounds = coords.reduce((b, c) => b.extend(c), new maplibregl.LngLatBounds(coords[0], coords[0]));
    map.fitBounds(bounds, { padding: 50 });
  } catch (_) {}
}

function _makeMarker(map, lngLat, color, label) {
  const el = document.createElement('div');
  el.style.cssText = `width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.4)`;
  const m = new maplibregl.Marker({ element: el }).setLngLat(lngLat);
  if (label) m.setPopup(new maplibregl.Popup({ offset: 12 }).setText(label));
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
    routeSource: 'route', routeLayer: 'route-line', routeColor: '#2563eb',
  },
  food: {
    map: null, markers: {}, mode: 'pickup',
    pickupInputId: 'food-pickup', dropoffInputId: 'food-address',
    hintId: 'food-map-mode-hint', btnPickupId: 'food-map-mode-pickup', btnDropoffId: 'food-map-mode-dropoff',
    routeSource: 'food-route', routeLayer: 'food-route-line', routeColor: '#f97316',
  },
  parcel: {
    map: null, markers: {}, mode: 'pickup',
    pickupInputId: 'parcel-sender-address', dropoffInputId: 'parcel-receiver-address',
    hintId: 'parcel-map-mode-hint', btnPickupId: 'parcel-map-mode-pickup', btnDropoffId: 'parcel-map-mode-dropoff',
    routeSource: 'parcel-route', routeLayer: 'parcel-route-line', routeColor: '#22c55e',
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

function _wireMapClick(tab) {
  const cfg = _maps[tab];
  cfg.map.getCanvas().style.cursor = 'crosshair';
  cfg.map.on('click', async (e) => {
    const address = await _reverseGeocode(e.lngLat);
    const lngLat = [e.lngLat.lng, e.lngLat.lat];
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
      if (cfg.markers.pickup && cfg.markers.dropoff) {
        _drawRouteOnMap(cfg.map, cfg.routeSource, cfg.routeLayer, cfg.routeColor,
          cfg.markers.pickup.getLngLat().toArray(),
          cfg.markers.dropoff.getLngLat().toArray()
        );
      }
    }
  });
}

/* ── Public init functions ──────────────────────────────────────────────── */
function initTrackingMap(containerId) {
  _maps.ride.map = _initMap(containerId);
  _maps.ride.map.addControl(new maplibregl.NavigationControl(), 'top-right');
  _wireMapClick('ride');
  return _maps.ride.map;
}

function initFoodMap(containerId) {
  _maps.food.map = _initMap(containerId);
  _maps.food.map.addControl(new maplibregl.NavigationControl(), 'top-right');
  _wireMapClick('food');
  return _maps.food.map;
}

function initParcelMap(containerId) {
  _maps.parcel.map = _initMap(containerId);
  _maps.parcel.map.addControl(new maplibregl.NavigationControl(), 'top-right');
  _wireMapClick('parcel');
  return _maps.parcel.map;
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

function initNavigationMap(containerId) {
  navMap = _initMap(containerId);
  navMap.addControl(new maplibregl.NavigationControl(), 'top-right');
  navMap.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: true },
    trackUserLocation: true,
    showUserHeading: true,
  }), 'top-right');
  return navMap;
}

async function showRiderRoute(pickupAddr, dropoffAddr) {
  if (!navMap) return;
  const geocode = async (addr) => {
    const r = await fetch(`https://api.maptiler.com/geocoding/${encodeURIComponent(addr)}.json?key=${MAPTILER_KEY}&limit=1`);
    const d = await r.json();
    return d.features?.[0]?.center || null;
  };
  const [pickup, dropoff] = await Promise.all([geocode(pickupAddr), geocode(dropoffAddr)]);
  if (!pickup || !dropoff) return;
  [['pickup', pickup, '#22c55e', 'Pickup'], ['dropoff', dropoff, '#ef4444', 'Drop-off']].forEach(([id, lngLat, color, label]) => {
    if (navMarkers[id]) navMarkers[id].remove();
    navMarkers[id] = _makeMarker(navMap, lngLat, color, label);
  });
  await _drawRouteOnMap(navMap, 'nav-route', 'nav-route-line', '#f97316', pickup, dropoff);
}
