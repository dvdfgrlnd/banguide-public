/**
 * Distance Overlay Module — tap-to-circles overlay for hole maps.
 * Decisions: D-01 fixed palette, D-02 inline labels, D-03 stroke-only, D-04 top-6 default.
 * All distances are stored in meters.
 */

const LONG_PRESS_MS = 500;

export const CLUB_COLORS = [
  '#e63946', // 1 — red
  '#2196f3', // 2 — blue
  '#4caf50', // 3 — green
  '#ff9800', // 4 — orange
  '#9c27b0', // 5 — purple
  '#00bcd4', // 6 — cyan
  '#f06292', // 7 — pink
  '#8bc34a', // 8 — lime
  '#ff5722', // 9 — deep orange
  '#607d8b', // 10 — blue grey
];

function escHtml(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]
  ));
}

/**
 * @param {Object} options
 * @param {L.Map} options.map           — Leaflet map instance (CRS.Simple)
 * @param {Function} options.getClubs   — () => Array<{name, meters}>
 * @param {Function} [options.onRender] — ({visible, total, canClear}) callback after each render
 * @param {Function} [options.shouldHandleTap] — () => boolean; return false to ignore map taps
 * @param {Function} [options.onLongPress] — () => void; called after a successful long-press sets the center
 * @returns {{ clear: () => void, destroy: () => void }}
 */
export function initDistanceOverlay({ map, getClubs, onRender, shouldHandleTap, onLongPress }) {
  let layerGroup = null;
  let lastLatLng = null;

  let _pressTimer = null;
  let _pressStartPos = null;
  let _longPressPointerId = null;
  let _activePointers = new Set();
  let _suppressNextClick = false;

  const container = map.getContainer();

  function clearLayers() {
    if (layerGroup) {
      map.removeLayer(layerGroup);
      layerGroup = null;
    }
  }

  function renderCircles() {
    if (!lastLatLng) return;
    clearLayers();

    const allClubs = getClubs();
    const visibleClubs = allClubs;

    layerGroup = L.layerGroup();

    // Mark the tap origin so the radius center stays visible.
    L.circleMarker([lastLatLng.lat, lastLatLng.lng], {
      radius: 5,
      color: '#111111',
      weight: 2,
      fillColor: '#ffffff',
      fillOpacity: 1,
    }).addTo(layerGroup);

    visibleClubs.forEach((club, i) => {
      const radius = club.meters;
      const color = CLUB_COLORS[i % CLUB_COLORS.length];

      // D-03: stroke-only circle (fill: false)
      L.circle([lastLatLng.lat, lastLatLng.lng], {
        radius,
        color,
        fill: false,
        weight: 2.5,
        opacity: 1,
      }).addTo(layerGroup);

      // D-02: inline label at top of circle
      L.marker([lastLatLng.lat + radius, lastLatLng.lng], {
        icon: L.divIcon({
          className: 'overlay-label',
          html: `<span style="color:${color}">${escHtml(club.name)}</span>`,
          iconSize: null,
          iconAnchor: [0, 8],
        }),
        interactive: false,
      }).addTo(layerGroup);
    });

    layerGroup.addTo(map);

    if (typeof onRender === 'function') {
      onRender({
        visible: visibleClubs.length,
        total: allClubs.length,
        canClear: visibleClubs.length > 0,
      });
    }
  }

  function clear() {
    lastLatLng = null;
    clearLayers();

    if (typeof onRender === 'function') {
      const allClubs = getClubs();
      onRender({ visible: 0, total: allClubs.length, canClear: false });
    }
  }

  function clearPendingLongPress() {
    clearTimeout(_pressTimer);
    _pressTimer = null;
    _pressStartPos = null;
    _longPressPointerId = null;
  }

  function clientPointToMapLatLng(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const containerPoint = L.point(clientX - rect.left, clientY - rect.top);
    return map.containerPointToLatLng(containerPoint);
  }

  function onPointerDown(e) {
    _activePointers.add(e.pointerId);

    if (!e.isPrimary || e.button !== 0 || _activePointers.size !== 1) {
      clearPendingLongPress();
      return;
    }

    _pressStartPos = { x: e.clientX, y: e.clientY };
    _longPressPointerId = e.pointerId;
    _pressTimer = setTimeout(() => {
      _pressTimer = null;
      if (
        !_activePointers.has(_longPressPointerId)
        || _activePointers.size !== 1
      ) {
        _pressStartPos = null;
        _longPressPointerId = null;
        return;
      }

      if (typeof shouldHandleTap === 'function' && shouldHandleTap() === false) {
        _pressStartPos = null;
        _longPressPointerId = null;
        return;
      }

      const latlng = clientPointToMapLatLng(_pressStartPos.x, _pressStartPos.y);
      lastLatLng = latlng;
      renderCircles();

      // Leaflet may emit a click after long-press release; suppress that one
      // so measurement click logic is not triggered.
      _suppressNextClick = true;

      if (typeof onLongPress === 'function') {
        onLongPress();
      }

      _pressStartPos = null;
      _longPressPointerId = null;
    }, LONG_PRESS_MS);
  }

  function onPointerUp(e) {
    _activePointers.delete(e.pointerId);
    if (_longPressPointerId === e.pointerId) {
      clearPendingLongPress();
    }
  }

  function onPointerMove(e) {
    if (!_pressTimer || !_pressStartPos || e.pointerId !== _longPressPointerId) return;

    const dx = e.clientX - _pressStartPos.x;
    const dy = e.clientY - _pressStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      clearPendingLongPress();
    }
  }

  function onPointerCancel(e) {
    _activePointers.delete(e.pointerId);
    clearPendingLongPress();
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerCancel);
  container.addEventListener('pointermove', onPointerMove);

  if (typeof onRender === 'function') {
    const allClubs = getClubs();
    onRender({ visible: 0, total: allClubs.length, canClear: false });
  }

  function setCenter(latLng) {
    if (latLng) {
      lastLatLng = latLng;
      renderCircles();
    } else {
      clear();
    }
  }

  function consumeSuppressedTap() {
    if (!_suppressNextClick) {
      return false;
    }
    _suppressNextClick = false;
    return true;
  }

  return {
    clear,
    setCenter,
    consumeSuppressedTap,
    destroy() {
      container.removeEventListener('pointerdown', onPointerDown);
      container.removeEventListener('pointerup', onPointerUp);
      container.removeEventListener('pointercancel', onPointerCancel);
      container.removeEventListener('pointermove', onPointerMove);
      clearPendingLongPress();
      clearLayers();
    },
  };
}
