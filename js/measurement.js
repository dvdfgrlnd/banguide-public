const HINT_START = 'Tap start point';
const HINT_END = 'Tap end point';
const HINT_AGAIN = 'Tap to measure again';
const TAP_DELAY_MS = 300;

export function initMeasurement({ map, isCalibrated, onStateChange = () => {}, shouldHandleClick = () => true }) {
  let measurePoints = [];
  const layerGroup = L.layerGroup().addTo(map);
  let isActive = false;
  let destroyed = false;

  let _tapPending = false;
  let _tapPointerId = null;
  let _tapStartPos = null;
  let _tapDelayTimer = null;

  const container = map.getContainer();

  function renderLayer() {
    layerGroup.clearLayers();

    if (measurePoints.length === 0) return;

    const pointA = measurePoints[0];
    L.circleMarker(pointA, {
      radius: 7,
      color: '#e63946',
      weight: 2.5,
      fillColor: '#ffffff',
      fillOpacity: 1,
    }).addTo(layerGroup);

    if (measurePoints.length === 2) {
      const pointB = measurePoints[1];
      L.circleMarker(pointB, {
        radius: 7,
        color: '#e63946',
        weight: 2.5,
        fillColor: '#ffffff',
        fillOpacity: 1,
      }).addTo(layerGroup);

      L.polyline([pointA, pointB], {
        color: '#e63946',
        weight: 2,
        dashArray: '8 5',
        opacity: 0.9,
      }).addTo(layerGroup);

      const midLatLng = L.latLng(
        (pointA.lat + pointB.lat) / 2,
        (pointA.lng + pointB.lng) / 2,
      );

      const meters = map.distance(pointA, pointB);
      const metersRounded = Math.round(meters);
      const labelHtml = `<span class="measure-tooltip__text">${metersRounded} m</span>`;

      // Nudge the label off the segment in screen space so it does not overlap
      // markers on short measurements. Bias downward to avoid covering the top marker.
      const pointApx = map.latLngToContainerPoint(pointA);
      const pointBpx = map.latLngToContainerPoint(pointB);
      const midpointPx = map.latLngToContainerPoint(midLatLng);
      const dx = pointBpx.x - pointApx.x;
      const dy = pointBpx.y - pointApx.y;
      const segmentLength = Math.hypot(dx, dy) || 1;

      let normalX = -dy / segmentLength;
      let normalY = dx / segmentLength;
      if (normalY < 0) {
        normalX = -normalX;
        normalY = -normalY;
      }

      const pixelOffset = segmentLength < 40 ? 22 : 16;
      const labelPointPx = L.point(
        midpointPx.x + normalX * pixelOffset,
        midpointPx.y + normalY * pixelOffset,
      );
      const labelLatLng = map.containerPointToLatLng(labelPointPx);

      L.tooltip({
        permanent: true,
        direction: 'center',
        offset: [0, 0],
        className: 'measure-tooltip',
        interactive: false,
      })
        .setLatLng(labelLatLng)
        .setContent(labelHtml)
        .addTo(layerGroup);
    }
  }

  function clientPointToMapLatLng(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const containerPoint = L.point(clientX - rect.left, clientY - rect.top);
    return map.containerPointToLatLng(containerPoint);
  }

  function onPointerDown(e) {
    if (!isActive || destroyed || !isCalibrated()) return;
    if (!e.isPrimary || e.button !== 0) return;

    cancelPendingTap();

    _tapPending = true;
    _tapPointerId = e.pointerId;
    _tapStartPos = { x: e.clientX, y: e.clientY };
  }

  function onPointerUp(e) {
    if (!_tapPending || e.pointerId !== _tapPointerId) return;

    _tapPending = false;
    _tapPointerId = null;

    if (typeof shouldHandleClick === 'function' && shouldHandleClick() === false) {
      return;
    }

    const dx = e.clientX - _tapStartPos.x;
    const dy = e.clientY - _tapStartPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      return;
    }

    const latlng = clientPointToMapLatLng(e.clientX, e.clientY);

    _tapDelayTimer = setTimeout(() => {
      _tapDelayTimer = null;
      if (measurePoints.length >= 2) measurePoints = [];
      measurePoints.push(latlng);
      renderLayer();

      if (measurePoints.length === 1) {
        emitState(HINT_END);
      } else if (measurePoints.length === 2) {
        emitState(HINT_AGAIN);
      }
    }, TAP_DELAY_MS);
  }

  function onPointerCancel(e) {
    if (e.pointerId === _tapPointerId) {
      _tapPending = false;
      _tapPointerId = null;
    }
  }

  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerCancel);

  function clearMeasurementLayer() {
    measurePoints = [];
    layerGroup.clearLayers();
  }

  function emitState(hint) {
    onStateChange({
      active: isActive,
      hint,
      pointCount: measurePoints.length,
      canClear: measurePoints.length > 0,
    });
  }

  function start() {
    if (destroyed) return;
    isActive = true;
    clearMeasurementLayer();
    emitState(HINT_START);
  }

  function stop() {
    isActive = false;
    clearMeasurementLayer();
    emitState('');
  }

  function cancelPendingTap() {
    if (_tapDelayTimer) {
      clearTimeout(_tapDelayTimer);
      _tapDelayTimer = null;
    }
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    isActive = false;
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointercancel', onPointerCancel);
    cancelPendingTap();
    clearMeasurementLayer();
    if (map.hasLayer(layerGroup)) {
      map.removeLayer(layerGroup);
    }
    emitState('');
  }

  function clear() {
    if (destroyed || !isActive) {
      return;
    }
    clearMeasurementLayer();
    emitState(HINT_START);
  }

  start();

  return { start, stop, clear, destroy, cancelPendingTap };
}
