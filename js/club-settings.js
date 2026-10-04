/**
 * Shared club settings component.
 * Renders the club list and wires add/edit/delete interactions. Used by the
 * header settings gear on the course list and course pages, and by the hole
 * page's settings panel.
 */

import { loadClubs, addClub, updateClub, deleteClub } from './clubs.js';
import { createThemeSwitch } from './theme.js';

const GEAR_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

export function escapeClubText(text) {
  return String(text).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[m]));
}

/**
 * Render the club list into the given container.
 * @param {HTMLElement} listEl
 */
export function renderClubList(listEl) {
  if (!listEl) {
    return;
  }

  const clubs = loadClubs();
  listEl.innerHTML = clubs.map((club, i) => `
    <div class="club-row" data-index="${i}">
      <span class="club-row__name">${escapeClubText(club.name)}</span>
      <span class="club-row__meters">${club.meters} m</span>
      <button class="club-row__edit" data-action="edit" data-index="${i}" type="button" aria-label="Edit ${escapeClubText(club.name)}">Edit</button>
      <button class="club-row__delete" data-action="delete" data-index="${i}" type="button" aria-label="Delete ${escapeClubText(club.name)}">✕</button>
    </div>
  `).join('');
}

/**
 * Wire the club list edit/delete/save/cancel actions and the add form.
 * @param {Object} options
 * @param {HTMLElement} options.listEl
 * @param {HTMLFormElement} options.formEl
 * @param {HTMLInputElement} options.nameInputEl
 * @param {HTMLInputElement} options.metersInputEl
 */
export function setupClubListInteractions({ listEl, formEl, nameInputEl, metersInputEl }) {
  if (!listEl || !formEl) {
    return;
  }

  listEl.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) {
      return;
    }

    const index = parseInt(button.dataset.index, 10);
    const action = button.dataset.action;

    if (action === 'delete') {
      deleteClub(index);
      renderClubList(listEl);
    } else if (action === 'edit') {
      const row = button.closest('.club-row');
      const clubs = loadClubs();
      const club = clubs[index];
      row.innerHTML = `
        <input type="text" class="club-input club-edit-name" value="${escapeClubText(club.name)}" maxlength="20">
        <input type="number" class="club-input club-input--meters club-edit-meters" value="${club.meters}" min="1" max="366">
        <button class="club-row__save" data-action="save" data-index="${index}" type="button">Save</button>
        <button class="club-row__cancel" data-action="cancel" type="button">✕</button>
      `;
    } else if (action === 'save') {
      const row = button.closest('.club-row');
      const name = row.querySelector('.club-edit-name').value.trim();
      const meters = parseInt(row.querySelector('.club-edit-meters').value, 10);
      if (name && meters > 0 && meters <= 366) {
        updateClub(index, name, meters);
        renderClubList(listEl);
      }
    } else if (action === 'cancel') {
      renderClubList(listEl);
    }
  });

  formEl.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = nameInputEl.value.trim();
    const meters = parseInt(metersInputEl.value, 10);
    if (name && meters > 0 && meters <= 366) {
      addClub(name, meters);
      nameInputEl.value = '';
      metersInputEl.value = '';
      renderClubList(listEl);
    }
  });
}

/**
 * Mount a self-contained club settings gear + popover into a container.
 * Used on pages that have no map (course list and course pages).
 * @param {HTMLElement} container
 * @returns {{ open: () => void, close: () => void } | null}
 */
export function mountClubSettings(container) {
  if (!container) {
    return null;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'header-settings';
  wrapper.innerHTML = `
    <button class="header-settings__button" type="button" data-club-settings-toggle aria-label="Settings" aria-expanded="false" aria-controls="clubSettingsPanel">
      ${GEAR_ICON}
    </button>
    <button class="club-settings__backdrop" type="button" data-club-settings-backdrop aria-label="Close settings" hidden></button>
    <div class="club-settings__panel" id="clubSettingsPanel" hidden>
      <div data-club-settings-theme></div>
      <div class="club-settings__list" data-club-settings-list aria-live="polite"></div>
      <form class="club-add-form" data-club-settings-form novalidate>
        <input type="text" class="club-input" data-club-settings-name placeholder="Club (e.g. 7-iron)" maxlength="20" autocomplete="off">
        <input type="number" class="club-input club-input--meters" data-club-settings-meters placeholder="meters" min="1" max="366" autocomplete="off">
        <button type="submit" class="club-add-btn">Add</button>
      </form>
    </div>
  `;
  container.appendChild(wrapper);

  const toggle = wrapper.querySelector('[data-club-settings-toggle]');
  const backdrop = wrapper.querySelector('[data-club-settings-backdrop]');
  const panel = wrapper.querySelector('.club-settings__panel');
  const listEl = wrapper.querySelector('[data-club-settings-list]');
  const formEl = wrapper.querySelector('[data-club-settings-form]');
  const nameInputEl = wrapper.querySelector('[data-club-settings-name]');
  const metersInputEl = wrapper.querySelector('[data-club-settings-meters]');
  const themeHostEl = wrapper.querySelector('[data-club-settings-theme]');

  themeHostEl.appendChild(createThemeSwitch());
  renderClubList(listEl);
  setupClubListInteractions({ listEl, formEl, nameInputEl, metersInputEl });

  function setOpen(isOpen) {
    panel.hidden = !isOpen;
    backdrop.hidden = !isOpen;
    toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  toggle.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(panel.hidden);
  });

  backdrop.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      setOpen(false);
    }
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
  };
}
