/**
 * Courses Module - Shared data loading and render helpers
 * ES module for course catalogue and course detail pages
 */

import { deleteImportedCourse, loadImportedCourses } from './imported-data.js';

/**
 * Load courses from imported storage only.
 * @returns {Promise<Array>} Array of course objects (empty array if no courses found)
 */
export async function loadCourses() {
  try {
    const imported = await loadImportedCourses();
    if (!imported || imported.length === 0) {
      return [];
    }

    const sortedImported = imported
      .map((course, index) => ({ course, index }))
      .sort((a, b) => {
        const aName = (a.course?.name || '').trim();
        const bName = (b.course?.name || '').trim();

        if (aName && bName) {
          const byName = aName.localeCompare(bName, undefined, {
            sensitivity: 'base'
          });
          if (byName !== 0) {
            return byName;
          }
        } else if (aName || bName) {
          // Prefer named courses before unnamed entries.
          return aName ? -1 : 1;
        }

        const aId = (a.course?.id || '').trim();
        const bId = (b.course?.id || '').trim();
        const byId = aId.localeCompare(bId, undefined, {
          sensitivity: 'base'
        });
        if (byId !== 0) {
          return byId;
        }

        // Stable fallback when name/id are equivalent.
        return a.index - b.index;
      })
      .map((entry) => entry.course);

    return sortedImported.map(course => ({
      id: course.id,
      name: course.name,
      address: '',
      holes: course.holeCount,
      par: 72
    }));
  } catch (error) {
    console.error('Failed to load imported courses:', error);
    return [];
  }
}

/**
 * Render course count text
 * @param {number} count - Number of courses
 * @returns {string} Formatted course count text
 */
export function renderCourseCount(count) {
  const text = count === 1 ? 'course' : 'courses';
  return `Stockholm golf courses · ${count} ${text}`;
}

/**
 * Create a course card element with separate navigation and delete controls.
 * @param {Object} course - Course object with id, name, address, holes, par
 * @returns {HTMLElement} Course card container element
 */
export function createCourseCard(course) {
  const card = document.createElement('div');
  card.className = 'course-card-shell';

  card.innerHTML = `
    <a class="course-card" href="course.html?id=${encodeURIComponent(course.id)}">
      <div class="course-card-header">
        <div class="course-card-name">${escapeHtml(course.name)}</div>
        <div class="course-card-chevron">›</div>
      </div>
      <div class="course-card-address">${escapeHtml(course.address)}</div>
      <div class="course-card-meta">
        <span class="badge">
          <span class="badge-dot"></span>
          ${course.holes} holes
        </span>
        <span class="badge">
          <span class="badge-dot"></span>
          Par ${course.par}
        </span>
      </div>
    </a>
    <button
      type="button"
      class="course-card-delete"
      data-action="delete-course"
      data-course-id="${escapeHtml(course.id)}"
      data-course-name="${escapeHtml(course.name)}"
      aria-label="Delete ${escapeHtml(course.name)}"
      title="Delete ${escapeHtml(course.name)}"
    >
      ×
    </button>
  `;

  return card;
}

/**
 * Get a course by ID
 * @param {Array} courses - Array of course objects
 * @param {string} id - Course ID to look up
 * @returns {Object|null} Course object or null if not found
 */
export function getCourseById(courses, id) {
  return courses.find(c => c.id === id) || null;
}

/**
 * Delete a persisted course and its related imported data.
 * @param {string} courseId - Course ID to delete
 * @returns {Promise<void>}
 */
export async function deleteCourse(courseId) {
  if (!courseId) {
    throw new Error('Course ID is required');
  }

  await deleteImportedCourse(courseId);
}

/**
 * Import a course package and add to imported storage
 * @param {FileList} files - Selected files from import dialog
 * @param {string} courseName - Name to use for imported course
 * @returns {Promise<{courseId, courseName, holeCount}>} Import result
 */
export async function importCourse(files, courseName) {
  const { importAndPersistCourse } = await import('./imported-data.js');
  
  // Generate courseId from timestamp and name (ensure unique)
  const timestamp = Date.now();
  const slug = courseName
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  const courseId = `import-${timestamp}-${slug}` || `import-${timestamp}`;
  
  return importAndPersistCourse(files, courseId, courseName);
}

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}
