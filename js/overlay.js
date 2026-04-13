/**
 * Distance Overlay Module — tap-to-circles overlay for hole maps.
 * Decisions: D-01 fixed palette, D-02 inline labels, D-03 stroke-only, D-04 top-6 default.
 * All distances are stored in meters.
 */

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
 * @returns {{ clear: () => void, destroy: () => void }}
 */
export function initDistanceOverlay({ map, getClubs, onRender, shouldHandleTap }) {
  let layerGroup = null;
  let lastLatLng = null;

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

  function handleTap(e) {
    if (typeof shouldHandleTap === 'function' && shouldHandleTap() === false) {
      return;
    }

    lastLatLng = e.latlng;
    renderCircles();
  }

  map.on('click', handleTap);

  if (typeof onRender === 'function') {
    const allClubs = getClubs();
    onRender({ visible: 0, total: allClubs.length, canClear: false });
  }

  return {
    clear,
    destroy() {
      map.off('click', handleTap);
      clearLayers();
    },
  };
}
