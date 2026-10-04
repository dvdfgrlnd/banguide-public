/**
 * Tests for theme.js
 * Run with: node --test js/theme.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Minimal browser mocks ─────────────────────────────────────────────────────
const mediaListeners = [];

function makeMediaQueryList({ withAddEventListener }) {
  const mql = {
    matches: false,
    addListener(fn) {
      mediaListeners.push(['addListener', fn]);
    },
  };
  if (withAddEventListener) {
    mql.addEventListener = (type, fn) => mediaListeners.push([type, fn]);
  }
  return mql;
}

// Simulate older iOS Safari, where MediaQueryList only has `addListener`.
globalThis.window = {
  matchMedia: () => makeMediaQueryList({ withAddEventListener: false }),
};
globalThis.document = {
  documentElement: { setAttribute() {} },
  querySelector: () => null,
  dispatchEvent() {},
  addEventListener() {},
};
globalThis.localStorage = { getItem: () => null, setItem() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type) {
    this.type = type;
  }
};

const { initTheme, getTheme } = await import('./theme.js');

// ── Tests ─────────────────────────────────────────────────────────────────────

test('initTheme does not throw and falls back to addListener on older Safari', () => {
  assert.doesNotThrow(() => initTheme());
  assert.ok(
    mediaListeners.some(([type]) => type === 'addListener'),
    'should register the change handler via the deprecated addListener API',
  );
});

test('getTheme falls back to light when matchMedia is unavailable', () => {
  const original = globalThis.window.matchMedia;
  globalThis.window.matchMedia = () => {
    throw new Error('matchMedia unavailable');
  };

  try {
    assert.equal(getTheme(), 'light');
  } finally {
    globalThis.window.matchMedia = original;
  }
});
