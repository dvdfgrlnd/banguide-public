/**
 * Tests for double-tap-zoom.js
 * Run with: node --test js/double-tap-zoom.test.js
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal Leaflet mock ──────────────────────────────────────────────────────
const L = {
  point: (x, y) => ({ x, y }),
};

// ── Minimal DOM mock ──────────────────────────────────────────────────────────
function makeElement(className = '') {
  const el = {
    className,
    listeners: {},
    addEventListener(type, fn) {
      (this.listeners[type] ||= []).push(fn);
    },
    removeEventListener(type, fn) {
      this.listeners[type] = (this.listeners[type] || []).filter((f) => f !== fn);
    },
    dispatchEvent(event) {
      for (const fn of this.listeners[event.type] || []) {
        fn(event);
      }
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    },
    closest(selector) {
      // Simple mock: check if className contains any of the selector classes
      const classes = selector.replace(/\./g, '').split(',').map((s) => s.trim());
      return classes.some((c) => this.className.includes(c)) ? this : null;
    },
  };
  return el;
}

// ── Minimal map mock ──────────────────────────────────────────────────────────
function makeMap() {
  const container = makeElement('leaflet-container');
  let zoom = 0;
  return {
    container,
    getContainer: () => container,
    getZoom: () => zoom,
    setZoomAround: (_latlng, z) => { zoom = z; },
    _setZoom: (z) => { zoom = z; },
    getMinZoom: () => -5,
    getMaxZoom: () => 3,
    containerPointToLatLng: (pt) => ({ lat: pt.y, lng: pt.x }),
    dragging: {
      enabled: () => true,
      disable: () => {},
      enable: () => {},
    },
    doubleClickZoom: {
      disable: () => {},
      enable: () => {},
    },
    _getZoom: () => zoom,
  };
}

// ── Helper to create a pointer event ──────────────────────────────────────────
function pointerEvent({ x = 0, y = 0, target, pointerId = 1, isPrimary = true, button = 0, type = 'pointerdown' }) {
  return {
    type,
    clientX: x,
    clientY: y,
    target,
    pointerId,
    isPrimary,
    button,
    preventDefault() {},
    stopImmediatePropagation() {},
  };
}

// ── Import the module under test ──────────────────────────────────────────────
// We need to set up global L before importing
globalThis.L = L;

const { initDoubleTapZoom } = await import('./double-tap-zoom.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

test('double-tap on map container triggers zoom', () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;

  // First tap
  container.dispatchEvent(pointerEvent({ x: 100, y: 100, target: container }));

  // Second tap within 250ms and 30px — should trigger zoom
  container.dispatchEvent(pointerEvent({ x: 105, y: 102, target: container }));

  // Zoom should have increased by 1
  assert.equal(map._getZoom(), 1, 'zoom should increase after double-tap on map');
});

test('double-tap on score button (inside hole-info-panel) does NOT trigger zoom', () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;
  const scoreButton = makeElement('scorecard-stepper__button');
  const panel = makeElement('hole-info-panel');
  // Simulate DOM hierarchy: button is inside panel
  scoreButton.closest = (selector) => {
    if (selector.includes('hole-info-panel')) return panel;
    return null;
  };

  // First tap on score button
  container.dispatchEvent(pointerEvent({ x: 100, y: 100, target: scoreButton }));

  // Second tap on score button — should NOT trigger zoom
  container.dispatchEvent(pointerEvent({ x: 105, y: 102, target: scoreButton }));

  // Zoom should remain unchanged
  assert.equal(map._getZoom(), 0, 'zoom should not change after double-tap on score button');
});

test('double-tap on nav bar does NOT trigger zoom', () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;
  const navButton = makeElement('hole-nav-bar__center');
  const navBar = makeElement('hole-nav-bar');
  navButton.closest = (selector) => {
    if (selector.includes('hole-nav-bar')) return navBar;
    return null;
  };

  container.dispatchEvent(pointerEvent({ x: 50, y: 50, target: navButton }));
  container.dispatchEvent(pointerEvent({ x: 52, y: 51, target: navButton }));

  assert.equal(map._getZoom(), 0, 'zoom should not change after double-tap on nav bar');
});

test('double-tap on club settings panel does NOT trigger zoom', () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;
  const settingsButton = makeElement('club-settings__button');
  const panel = makeElement('club-settings__panel');
  settingsButton.closest = (selector) => {
    if (selector.includes('club-settings__panel')) return panel;
    return null;
  };

  container.dispatchEvent(pointerEvent({ x: 200, y: 200, target: settingsButton }));
  container.dispatchEvent(pointerEvent({ x: 202, y: 201, target: settingsButton }));

  assert.equal(map._getZoom(), 0, 'zoom should not change after double-tap on club settings');
});

test('single tap on map does not trigger zoom', () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;

  // Just one tap
  container.dispatchEvent(pointerEvent({ x: 100, y: 100, target: container }));

  assert.equal(map._getZoom(), 0, 'zoom should not change after single tap');
});

test('two taps too far apart do not trigger zoom', () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;

  container.dispatchEvent(pointerEvent({ x: 100, y: 100, target: container }));
  // Second tap more than 30px away
  container.dispatchEvent(pointerEvent({ x: 200, y: 200, target: container }));

  assert.equal(map._getZoom(), 0, 'zoom should not change when taps are too far apart');
});

test('two taps too far apart in time do not trigger zoom', async () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;

  container.dispatchEvent(pointerEvent({ x: 100, y: 100, target: container }));

  // Wait more than 250ms
  await new Promise((resolve) => setTimeout(resolve, 300));

  container.dispatchEvent(pointerEvent({ x: 102, y: 101, target: container }));

  assert.equal(map._getZoom(), 0, 'zoom should not change when taps are too far apart in time');
});

test('zoom drag after double-tap on map works', () => {
  const map = makeMap();
  initDoubleTapZoom({ map });

  const container = map.container;

  // Double-tap to enter zoom mode
  container.dispatchEvent(pointerEvent({ x: 100, y: 100, target: container }));
  container.dispatchEvent(pointerEvent({ x: 100, y: 100, target: container }));

  // Now zoom should be 1
  assert.equal(map._getZoom(), 1);

  // Drag up to zoom out (dragging up = decreasing Y = zoom out)
  container.dispatchEvent(pointerEvent({ x: 100, y: 0, target: container, pointerId: 1, type: 'pointermove' }));

  // Zoom should have changed (dragged 100px up = 1 zoom level down from base of 1)
  assert.equal(map._getZoom(), 0, 'zoom should decrease after drag up');
});

test('destroy removes listeners', () => {
  const map = makeMap();
  const cleanup = initDoubleTapZoom({ map });

  const container = map.container;
  const listenerCount = (container.listeners['pointerdown'] || []).length;

  cleanup.destroy();

  const newListenerCount = (container.listeners['pointerdown'] || []).length;
  assert.equal(newListenerCount, listenerCount - 1, 'pointerdown listener should be removed');
});
