/**
 * GPS Module — User geolocation tracking on hole maps.
 *
 * Features:
 * - Real GPS via navigator.geolocation.watchPosition
 * - Debug simulation mode that moves coordinates along a predefined path
 * - Anchor-based coordinate transformation (lat/lng → map pixels)
 * - Leaflet marker for user position
 */

const ANCHOR_STORAGE_KEY = 'banguide_gps_anchor_v1';
const SIMULATION_STEP_MS = 1000;
const METERS_PER_DEG_LAT = 111320;

// Simulation path: a simple fairway walk (~300 m)
// Waypoints are { latOffset, lngOffset } in degrees from the base position.
const SIMULATION_WAYPOINTS = [
  { latOffset: 0.0000, lngOffset: 0.0000 },
  { latOffset: 0.0005, lngOffset: 0.0001 },
  { latOffset: 0.0010, lngOffset: -0.00005 },
  { latOffset: 0.0015, lngOffset: 0.00015 },
  { latOffset: 0.0020, lngOffset: -0.0001 },
  { latOffset: 0.0025, lngOffset: 0.00005 },
  { latOffset: 0.0027, lngOffset: 0.0000 },
];

let state = {
  watchId: null,
  simulationTimer: null,
  simulationStepIndex: 0,
  simulationSubStep: 0,
  isSimulating: false,
  baseLatLng: null,
  currentLatLng: null,
  marker: null,
  map: null,
  anchor: null,
  callbacks: [],
  isSettingAnchor: false,
  visibilityHandler: null,
};

function getAnchorStorageKey(courseId, holeNumber) {
  return `${courseId}:${holeNumber}`;
}

// ─── Anchor persistence ───

export function loadAnchor(courseId, holeNumber) {
  try {
    const raw = localStorage.getItem(ANCHOR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const value = parsed[getAnchorStorageKey(courseId, holeNumber)];
    if (
      value &&
      typeof value.lat === 'number' &&
      typeof value.lng === 'number' &&
      typeof value.x === 'number' &&
      typeof value.y === 'number'
    ) {
      return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveAnchor(courseId, holeNumber, anchor) {
  try {
    const raw = localStorage.getItem(ANCHOR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const store = parsed && typeof parsed === 'object' ? parsed : {};
    store[getAnchorStorageKey(courseId, holeNumber)] = {
      lat: Number(anchor.lat),
      lng: Number(anchor.lng),
      x: Number(anchor.x),
      y: Number(anchor.y),
    };
    localStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

export function clearAnchor(courseId, holeNumber) {
  try {
    const raw = localStorage.getItem(ANCHOR_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return;
    delete parsed[getAnchorStorageKey(courseId, holeNumber)];
    localStorage.setItem(ANCHOR_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

// ─── Coordinate transformation ───

/**
 * Convert lat/lng to map pixel coordinates using an anchor.
 * @param {number} lat
 * @param {number} lng
 * @param {Object} anchor — { lat, lng, x, y }
 * @param {number} orientation — degrees from North (0 = North is up)
 * @param {number} metersPerPixel
 * @returns {{x: number, y: number}|null}
 */
export function latLngToMapPixel(lat, lng, anchor, orientation = 0, metersPerPixel = 1) {
  if (
    !anchor ||
    !Number.isFinite(anchor.lat) ||
    !Number.isFinite(anchor.lng) ||
    !Number.isFinite(anchor.x) ||
    !Number.isFinite(anchor.y)
  ) {
    return null;
  }

  const dLat = lat - anchor.lat;
  const dLng = lng - anchor.lng;
  const metersPerDegLng = METERS_PER_DEG_LAT * Math.cos(anchor.lat * (Math.PI / 180));
  const north = dLat * METERS_PER_DEG_LAT;
  const east = dLng * metersPerDegLng;

  const rad = (orientation * Math.PI) / 180;
  const mapX = anchor.x + (east * Math.cos(rad) - north * Math.sin(rad)) / metersPerPixel;
  const mapY = anchor.y + (east * Math.sin(rad) + north * Math.cos(rad)) / metersPerPixel;

  return { x: mapX, y: mapY };
}

// ─── Marker management ───

function ensureMarker() {
  if (!state.map || state.marker) return;

  state.marker = L.circleMarker([0, 0], {
    radius: 8,
    color: '#1f78b4',
    weight: 3,
    fillColor: '#a6cee3',
    fillOpacity: 0.9,
  }).addTo(state.map);
}

function removeMarker() {
  if (state.marker && state.map) {
    state.map.removeLayer(state.marker);
  }
  state.marker = null;
}

function updateMarkerPosition(lat, lng) {
  if (!state.marker || !state.map) return;
  state.marker.setLatLng([lat, lng]);
}

// ─── Position pipeline ───

function handlePosition(lat, lng) {
  state.currentLatLng = { lat, lng };

  if (state.anchor && state.map) {
    const orientation = state.anchor.orientation || 0;
    console.log(`Received position: lat=${lat.toFixed(6)}, lng=${lng.toFixed(6)}, orientation=${orientation}°`);
    const metersPerPixel = state.anchor.metersPerPixel || 1;
    const pixel = latLngToMapPixel(lat, lng, state.anchor, orientation, metersPerPixel);
    if (pixel) {
      ensureMarker();
      updateMarkerPosition(pixel.y * metersPerPixel, pixel.x * metersPerPixel);
    }
  }

  state.callbacks.forEach((cb) => {
    try {
      cb({ lat, lng, anchor: state.anchor });
    } catch (e) {
      console.error('GPS callback error:', e);
    }
  });
}

// ─── Real GPS ───

export function startRealGPS() {
  if (state.watchId !== null) return;
  if (!navigator.geolocation || !navigator.geolocation.watchPosition) {
    console.warn('Geolocation API not available');
    return;
  }

  state.watchId = navigator.geolocation.watchPosition(
    (position) => {
      if (!state.isSimulating) {
        handlePosition(position.coords.latitude, position.coords.longitude);
      }
    },
    (error) => {
      console.warn('GPS error:', error.message);
    },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

export function stopRealGPS() {
  if (state.watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
  }
}

// ─── Simulation ───

function getSimulatedLatLng(stepIndex, subStep) {
  const subStepsPerSegment = 10;
  const totalSegments = SIMULATION_WAYPOINTS.length - 1;
  const globalStep = stepIndex * subStepsPerSegment + subStep;
  const totalSubSteps = totalSegments * subStepsPerSegment;
  const t = Math.min(globalStep / totalSubSteps, 1);

  const scaledT = t * totalSegments;
  const idx = Math.min(Math.floor(scaledT), totalSegments - 1);
  const localT = scaledT - idx;

  const a = SIMULATION_WAYPOINTS[idx];
  const b = SIMULATION_WAYPOINTS[idx + 1];

  // Add tiny noise so the marker wiggles a bit
  const noiseLat = (Math.random() - 0.5) * 0.00002;
  const noiseLng = (Math.random() - 0.5) * 0.00002;

  return {
    lat: state.baseLatLng.lat + a.latOffset + (b.latOffset - a.latOffset) * localT + noiseLat,
    lng: state.baseLatLng.lng + a.lngOffset + (b.lngOffset - a.lngOffset) * localT + noiseLng,
  };
}

export function startSimulation() {
  if (state.isSimulating) return;

  if (!state.baseLatLng) {
    state.baseLatLng = { lat: 59.3, lng: 18.0 };
  }

  state.isSimulating = true;
  state.simulationStepIndex = 0;
  state.simulationSubStep = 0;

  const pos = getSimulatedLatLng(0, 0);
  handlePosition(pos.lat, pos.lng);

  state.simulationTimer = window.setInterval(() => {
    state.simulationSubStep += 1;
    if (state.simulationSubStep > 9) {
      state.simulationSubStep = 0;
      state.simulationStepIndex += 1;
      if (state.simulationStepIndex >= SIMULATION_WAYPOINTS.length - 1) {
        state.simulationStepIndex = 0;
      }
    }
    const next = getSimulatedLatLng(state.simulationStepIndex, state.simulationSubStep);
    handlePosition(next.lat, next.lng);
  }, SIMULATION_STEP_MS);
}

export function stopSimulation() {
  if (!state.isSimulating) return;
  state.isSimulating = false;
  if (state.simulationTimer) {
    clearInterval(state.simulationTimer);
    state.simulationTimer = null;
  }
  state.simulationStepIndex = 0;
  state.simulationSubStep = 0;
}

export function isSimulationActive() {
  return state.isSimulating;
}

// ─── Public lifecycle ───

export function initGPS(options) {
  const { map, courseId, holeNumber, orientation = 0, metersPerPixel = 1, onPosition, useSimulation } = options;

  destroyGPS();

  state.map = map;
  state.anchor = loadAnchor(courseId, holeNumber);
  if (state.anchor) {
    state.anchor.orientation = orientation;
    state.anchor.metersPerPixel = metersPerPixel;
  }

  if (typeof onPosition === 'function') {
    state.callbacks.push(onPosition);
  }

  // Handle visibility changes to pause GPS when backgrounded
  state.visibilityHandler = () => {
    if (document.hidden) {
      stopRealGPS();
    } else {
      startRealGPS();
    }
  };
  document.addEventListener('visibilitychange', state.visibilityHandler);

  startRealGPS();

  if (useSimulation) {
    startSimulation();
  }

  return {
    get anchor() {
      return state.anchor ? { ...state.anchor } : null;
    },
    get isSettingAnchor() {
      return state.isSettingAnchor;
    },
    setAnchorMode(enabled) {
      state.isSettingAnchor = Boolean(enabled);
    },
    setAnchor(lat, lng, x, y) {
      const anchor = {
        lat: Number(lat),
        lng: Number(lng),
        x: Number(x),
        y: Number(y),
        orientation,
        metersPerPixel,
      };
      state.anchor = anchor;
      saveAnchor(courseId, holeNumber, anchor);
      if (state.currentLatLng) {
        if (state.visibilityHandler) {
          document.removeEventListener('visibilitychange', state.visibilityHandler);
          state.visibilityHandler = null;
        }
        handlePosition(state.currentLatLng.lat, state.currentLatLng.lng);
      }
    },
    startSimulation,
    stopSimulation,
    destroy: destroyGPS,
  };
}

export function destroyGPS() {
  stopRealGPS();
  stopSimulation();
  removeMarker();
  state.map = null;
  state.anchor = null;
  state.currentLatLng = null;
  state.baseLatLng = null;
  if (state.visibilityHandler) {
    document.removeEventListener('visibilitychange', state.visibilityHandler);
    state.visibilityHandler = null;
  }
  state.callbacks = [];
  state.isSettingAnchor = false;
}

export function getGPSState() {
  return {
    isSimulating: state.isSimulating,
    currentLatLng: state.currentLatLng ? { ...state.currentLatLng } : null,
    anchor: state.anchor ? { ...state.anchor } : null,
    hasMarker: !!state.marker,
  };
}
