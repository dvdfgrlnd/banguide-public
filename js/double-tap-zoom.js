/**
 * Double-Tap Zoom Module — double-tap to zoom in, then drag up/down to zoom out/in.
 * Uses capture-phase pointer listeners so the gesture is isolated from overlay
 * long-press and measurement tap handlers that live in bubble phase.
 */

const DOUBLE_TAP_MS = 250;
const DOUBLE_TAP_DISTANCE_PX = 30;
const ZOOM_SENSITIVITY = 100; // pixels per zoom level

export function initDoubleTapZoom({ map, measurement } = {}) {
  if (!map || !map.getContainer) {
    return { destroy() {} };
  }

  const container = map.getContainer();

  let lastTapTime = 0;
  let lastTapPos = null;

  let isZoomDragging = false;
  let zoomDragPointerId = null;
  let zoomDragStartY = 0;
  let zoomDragBaseZoom = 0;
  let zoomDragTapLatLng = null;
  let dragWasDisabled = false;

  function disableMapDrag() {
    if (map.dragging && map.dragging.enabled && map.dragging.enabled()) {
      map.dragging.disable();
      dragWasDisabled = true;
    }
  }

  function enableMapDrag() {
    if (dragWasDisabled && map.dragging && !map.dragging.enabled()) {
      map.dragging.enable();
    }
    dragWasDisabled = false;
  }

  function endZoomDrag() {
    isZoomDragging = false;
    zoomDragPointerId = null;
    enableMapDrag();
  }

  function onPointerDown(e) {
    if (!e.isPrimary || e.button !== 0) {
      // A second pointer or non-left button cancels any active gesture
      if (isZoomDragging) {
        endZoomDrag();
      }
      return;
    }

    const now = Date.now();
    const pos = { x: e.clientX, y: e.clientY };

    // Check for double-tap
    if (lastTapPos && now - lastTapTime < DOUBLE_TAP_MS) {
      const dx = pos.x - lastTapPos.x;
      const dy = pos.y - lastTapPos.y;
      if (Math.hypot(dx, dy) <= DOUBLE_TAP_DISTANCE_PX) {
        // Double-tap detected — swallow this event before other handlers see it
        e.preventDefault();
        e.stopImmediatePropagation();

        // Cancel any pending measurement tap so the first tap of the double-tap
        // doesn't register as a measurement point.
        if (typeof measurement?.cancelPendingTap === 'function') {
          measurement.cancelPendingTap();
        }

        // Cancel any previous gesture first
        endZoomDrag();

        // Compute tap location in map space
        const rect = container.getBoundingClientRect();
        const containerPoint = L.point(pos.x - rect.left, pos.y - rect.top);
        zoomDragTapLatLng = map.containerPointToLatLng(containerPoint);

        // Zoom in one level immediately
        const currentZoom = map.getZoom();
        const targetZoom = Math.min(map.getMaxZoom(), currentZoom + 1);
        map.setZoomAround(zoomDragTapLatLng, targetZoom, { animate: false });

        // Enter zoom-drag mode
        isZoomDragging = true;
        zoomDragPointerId = e.pointerId;
        zoomDragStartY = pos.y;
        zoomDragBaseZoom = map.getZoom();
        disableMapDrag();

        // Reset tap tracking so a third quick tap isn't treated as another double-tap
        lastTapTime = 0;
        lastTapPos = null;
        return;
      }
    }

    // Not a double-tap — record this tap for future comparison
    lastTapTime = now;
    lastTapPos = pos;

    // If another primary pointer starts while we're zoom-dragging, cancel the gesture
    if (isZoomDragging && e.pointerId !== zoomDragPointerId) {
      endZoomDrag();
    }
  }

  function onPointerMove(e) {
    if (!isZoomDragging || e.pointerId !== zoomDragPointerId) {
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();

    const deltaY = e.clientY - zoomDragStartY;
    const zoomDelta = deltaY / ZOOM_SENSITIVITY;
    const newZoom = Math.max(
      map.getMinZoom(),
      Math.min(map.getMaxZoom(), zoomDragBaseZoom + zoomDelta)
    );

    map.setZoomAround(zoomDragTapLatLng, newZoom, { animate: false });
  }

  function onPointerUp(e) {
    if (!isZoomDragging || e.pointerId !== zoomDragPointerId) {
      return;
    }

    e.preventDefault();
    e.stopImmediatePropagation();
    endZoomDrag();
  }

  function onPointerCancel(e) {
    if (!isZoomDragging || e.pointerId !== zoomDragPointerId) {
      return;
    }
    endZoomDrag();
  }

  // Disable Leaflet's built-in double-click zoom so it doesn't compete
  if (map.doubleClickZoom) {
    map.doubleClickZoom.disable();
  }

  container.addEventListener('pointerdown', onPointerDown, true);
  container.addEventListener('pointermove', onPointerMove, true);
  container.addEventListener('pointerup', onPointerUp, true);
  container.addEventListener('pointercancel', onPointerCancel, true);

  return {
    destroy() {
      endZoomDrag();
      container.removeEventListener('pointerdown', onPointerDown, true);
      container.removeEventListener('pointermove', onPointerMove, true);
      container.removeEventListener('pointerup', onPointerUp, true);
      container.removeEventListener('pointercancel', onPointerCancel, true);
      if (map.doubleClickZoom) {
        map.doubleClickZoom.enable();
      }
    },
  };
}
