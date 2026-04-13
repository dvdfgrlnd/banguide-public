const LONG_PRESS_MS = 500;
const HINT_START = 'Tap start point';
const HINT_END = 'Tap end point';
const HINT_AGAIN = 'Tap to measure again';

export function initMeasurement({ map, isCalibrated, onStateChange = () => {} }) {
  let measurePoints = [];
  const layerGroup = L.layerGroup().addTo(map);
  let isActive = false;
  let destroyed = false;

  let _pressTimer = null;
  let _pressStartPos = null;
  let _longPressPointerId = null;
  let _activePointers = new Set();
  let _suppressNextTap = false;

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

  function clearPendingLongPress() {
    clearTimeout(_pressTimer);
    _pressTimer = null;
    _pressStartPos = null;
    _longPressPointerId = null;
  }

  function clearTapSuppression() {
    _suppressNextTap = false;
  }

  function resetGestureState() {
    _activePointers = new Set();
    clearPendingLongPress();
  }

  function clientPointToMapLatLng(clientX, clientY) {
    const rect = container.getBoundingClientRect();
    const containerPoint = L.point(clientX - rect.left, clientY - rect.top);
    return map.containerPointToLatLng(containerPoint);
  }

  function onPointerDown(e) {
    if (!isActive || !isCalibrated() || destroyed) return;
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
        !isActive
        || destroyed
        || !_activePointers.has(_longPressPointerId)
        || _activePointers.size !== 1
      ) {
        _pressStartPos = null;
        _longPressPointerId = null;
        return;
      }

      const latlng = clientPointToMapLatLng(_pressStartPos.x, _pressStartPos.y);
      if (measurePoints.length >= 2) measurePoints = [];
      measurePoints.push(latlng);
      renderLayer();

      if (measurePoints.length === 1) {
        emitState(HINT_END);
      } else if (measurePoints.length === 2) {
        emitState(HINT_AGAIN);
      }

      // Leaflet may emit a click after long-press release; suppress that one
      // so club overlay tap logic is not triggered.
      _suppressNextTap = true;

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

  const container = map.getContainer();
  container.addEventListener('pointerdown', onPointerDown);
  container.addEventListener('pointerup', onPointerUp);
  container.addEventListener('pointercancel', onPointerCancel);
  container.addEventListener('pointermove', onPointerMove);

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
    clearTapSuppression();
    isActive = true;
    clearMeasurementLayer();
    emitState(HINT_START);
  }

  function stop() {
    resetGestureState();
    clearTapSuppression();
    isActive = false;
    clearMeasurementLayer();
    emitState('');
  }

  function destroy() {
    if (destroyed) {
      return;
    }
    destroyed = true;
    resetGestureState();
    clearTapSuppression();
    isActive = false;
    container.removeEventListener('pointerdown', onPointerDown);
    container.removeEventListener('pointerup', onPointerUp);
    container.removeEventListener('pointercancel', onPointerCancel);
    container.removeEventListener('pointermove', onPointerMove);
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

  function consumeSuppressedTap() {
    if (!_suppressNextTap) {
      return false;
    }
    _suppressNextTap = false;
    return true;
  }

  start();

  return { start, stop, clear, destroy, consumeSuppressedTap };
}
