/**
 * Map Module — Leaflet-backed hole map rendering for hole detail pages.
 * Supports optional metersPerPixel: if missing (e.g., for imported uncalibrated holes),
 * map loads at 1:1 pixel scale and requires calibration before distance overlays work.
 */

const UNAVAILABLE_COPY = 'No hole diagram available yet';
const FIT_BOUNDS_PADDING = [8, 8];
const DEFAULT_meterS_PER_PIXEL = 1;  // Fallback for uncalibrated imported maps

function renderUnavailable(container, message = UNAVAILABLE_COPY) {
  container.className = 'hole-map hole-map--unavailable';
  container.innerHTML = `<p class="hole-map__unavailable-text">${message}</p>`;
}

function clearLeafletInstance(container) {
  const existingMap = container.__holeLeafletMap;
  if (existingMap && typeof existingMap.remove === 'function') {
    existingMap.remove();
  }
  if (typeof container.__holeInteractionGuardsCleanup === 'function') {
    container.__holeInteractionGuardsCleanup();
  }
  container.__holeLeafletMap = null;
  container.__holeInteractionGuardsCleanup = null;
}

function installInteractionGuards(container) {
  const suppressBrowserGestureUI = (event) => {
    event.preventDefault();
  };

  const events = ['contextmenu', 'selectstart', 'dragstart'];
  events.forEach((eventName) => {
    container.addEventListener(eventName, suppressBrowserGestureUI);
  });

  return () => {
    events.forEach((eventName) => {
      container.removeEventListener(eventName, suppressBrowserGestureUI);
    });
  };
}

function applyHoleBoundsConstraints(map, bounds, { resetView = false } = {}) {
  const currentCenter = resetView ? null : map.getCenter();
  const currentZoom = resetView ? null : map.getZoom();

  map.fitBounds(bounds, { padding: FIT_BOUNDS_PADDING, animate: false });

  const fittedZoom = map.getZoom();

  map.setMinZoom(fittedZoom);
  map.setMaxBounds(bounds);
  map.options.maxBoundsViscosity = 1;

  if (!resetView && currentCenter && Number.isFinite(currentZoom)) {
    if (currentZoom > fittedZoom) {
      map.setView(currentCenter, currentZoom, { animate: false });
    }

    map.panInsideBounds(bounds, { animate: false });
  }
}

/**
 * Initialize hole map with optional calibration callback
 * @param {Object} options
 * @param {HTMLElement} options.container - Map container element
 * @param {Object} options.hole - Hole data object with .map property
 * @param {Function} [options.getmetersPerPixel] - Callback to get current calibration value
 * @returns {Object|null} Leaflet map instance or null if initialization failed
 */
export function initHoleMap({ container, hole, getmetersPerPixel } = {}) {
  if (!container) {
    return null;
  }

  clearLeafletInstance(container);
  container.__holeInteractionGuardsCleanup = installInteractionGuards(container);

  if (!hole || !hole.map) {
    renderUnavailable(container);
    return null;
  }

  const { image, widthPx, heightPx, metersPerPixel: importedmetersPerPixel } = hole.map;
  
  // Use calibration callback or imported value or default
  const effectivemetersPerPixel = (typeof getmetersPerPixel === 'function' ? getmetersPerPixel() : null)
    || (importedmetersPerPixel && Number.isFinite(importedmetersPerPixel) && importedmetersPerPixel > 0 ? importedmetersPerPixel : null)
    || DEFAULT_meterS_PER_PIXEL;
  
  const widthmeters = Number(widthPx) * Number(effectivemetersPerPixel);
  const heightmeters = Number(heightPx) * Number(effectivemetersPerPixel);

  if (!image || !Number.isFinite(widthmeters) || !Number.isFinite(heightmeters) || widthmeters <= 0 || heightmeters <= 0) {
    renderUnavailable(container);
    return null;
  }

  if (typeof L === 'undefined' || !L || !L.map || !L.imageOverlay) {
    renderUnavailable(container, 'Map engine unavailable');
    return null;
  }

  container.className = 'hole-map hole-map--loading';
  container.innerHTML = '';

  const bounds = [
    [0, 0],
    [heightmeters, widthmeters]
  ];

  const map = L.map(container, {
    crs: L.CRS.Simple,
    // CRS.Simple maps often need negative zoom to fit tall images in short viewports.
    minZoom: -5,
    maxZoom: 3,
    zoomSnap: 0.25,
    attributionControl: true
  });

  container.__holeLeafletMap = map;

  applyHoleBoundsConstraints(map, bounds, { resetView: true });

  const overlay = L.imageOverlay(image, bounds).addTo(map);
  const handleResize = () => requestAnimationFrame(() => {
    map.invalidateSize();
    applyHoleBoundsConstraints(map, bounds);
  });
  const cleanupInteractionGuards = () => {
    if (typeof container.__holeInteractionGuardsCleanup === 'function') {
      container.__holeInteractionGuardsCleanup();
    }
    container.__holeInteractionGuardsCleanup = null;
  };

  window.addEventListener('resize', handleResize);
  map.on('unload', () => {
    window.removeEventListener('resize', handleResize);
    cleanupInteractionGuards();
  });

  overlay.once('load', () => {
    container.classList.remove('hole-map--loading');
    requestAnimationFrame(() => {
      map.invalidateSize();
      applyHoleBoundsConstraints(map, bounds);
    });
  });

  overlay.once('error', () => {
    clearLeafletInstance(container);
    renderUnavailable(container, 'Hole map image not available');
  });

  return map;
}
