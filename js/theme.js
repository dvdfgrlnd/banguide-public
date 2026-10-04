/**
 * Theme Module — light/dark appearance preference.
 * Storage key: banguide_theme_v1 ("light" | "dark").
 *
 * An inline boot script in each page applies the initial `data-theme`
 * attribute before styles load (avoiding a flash). This module keeps the
 * applied theme in sync afterwards and renders the Light mode switch used in
 * the settings panels.
 */

const STORAGE_KEY = 'banguide_theme_v1';
const THEME_CHANGE_EVENT = 'banguide:themechange';
const LIGHT_THEME_COLOR = '#ffffff';
const DARK_THEME_COLOR = '#1a2126';

let initialized = false;

function readStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

function systemPrefersDark() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

/** Resolve the active theme: the saved choice, or the system preference. */
export function getTheme() {
  return readStoredTheme() || (systemPrefersDark() ? 'dark' : 'light');
}

export function isLightMode() {
  return getTheme() === 'light';
}

function updateMetaThemeColor(theme) {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    return;
  }
  meta.setAttribute('content', theme === 'dark' ? DARK_THEME_COLOR : LIGHT_THEME_COLOR);
  meta.removeAttribute('media');
}

/** Apply a theme to the document without persisting it. */
export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateMetaThemeColor(theme);
}

/** Persist and apply an explicit theme choice. */
export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures (e.g. iOS private browsing).
  }
  applyTheme(theme);
  document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
}

export function toggleLightMode(isLight) {
  setTheme(isLight ? 'light' : 'dark');
}

/**
 * Apply the resolved theme and follow system changes until the user makes an
 * explicit choice. Safe to call more than once.
 */
export function initTheme() {
  applyTheme(getTheme());
  if (initialized) {
    return;
  }
  initialized = true;

  let media;
  try {
    media = window.matchMedia('(prefers-color-scheme: dark)');
  } catch {
    return;
  }

  const handleChange = () => {
    if (readStoredTheme()) {
      return; // A saved choice wins over the system preference.
    }
    applyTheme(media.matches ? 'dark' : 'light');
    document.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT));
  };

  // Older iOS Safari exposes the deprecated `addListener` instead of
  // `addEventListener`. Throwing here used to abort the whole page module
  // (breaking the map and settings), so feature-detect and stay defensive.
  try {
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', handleChange);
    } else if (typeof media.addListener === 'function') {
      media.addListener(handleChange);
    }
  } catch {
    // Theme syncing is best-effort; never let it break the page.
  }
}

/**
 * Build the Light mode switch row for a settings panel.
 * @returns {HTMLElement}
 */
export function createThemeSwitch() {
  initTheme();

  const row = document.createElement('div');
  row.className = 'theme-setting';
  row.innerHTML = `
    <span class="theme-setting__text">
      <span class="theme-setting__label">Light mode</span>
      <span class="theme-setting__hint">Use the bright theme.</span>
    </span>
    <button type="button" class="theme-switch" role="switch" aria-checked="false" aria-label="Light mode">
      <span class="theme-switch__thumb" aria-hidden="true"></span>
    </button>
  `;

  const button = row.querySelector('.theme-switch');

  function sync() {
    const light = isLightMode();
    button.setAttribute('aria-checked', light ? 'true' : 'false');
    button.classList.toggle('theme-switch--on', light);
  }

  button.addEventListener('click', () => {
    toggleLightMode(!isLightMode());
    sync();
  });

  document.addEventListener(THEME_CHANGE_EVENT, sync);
  sync();

  return row;
}
