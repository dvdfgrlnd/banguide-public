/**
 * Holes Module — Shared data loading and hole-page helpers
 * ES module for course hole list and hole detail pages
 */

import { loadImportedHoles, getImportedHoleImageURL } from './imported-data.js';

async function getImageDimensionsFromUrl(url) {
  if (!url || typeof Image === 'undefined') {
    return null;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const widthPx = Number(img.naturalWidth);
      const heightPx = Number(img.naturalHeight);
      if (Number.isFinite(widthPx) && Number.isFinite(heightPx) && widthPx > 0 && heightPx > 0) {
        resolve({ widthPx, heightPx });
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * Load hole guide data for a course: imported storage first, then bundled
 * @param {string} courseId - Course ID slug (e.g. 'bromma-gk' or 'import-xxx-yyy')
 * @returns {Promise<Array>} Array of hole objects with image URLs resolved
 */
export async function loadHoles(courseId) {
  // Try imported storage first
  if (courseId && courseId.startsWith('import-')) {
    try {
      const holes = await loadImportedHoles(courseId);
      
      // Enhance imported holes with image URLs
      const enriched = await Promise.all(holes.map(async (hole) => {
        const imageUrl = await getImportedHoleImageURL(courseId, hole.hole);
        const fallbackDimensions = (!hole.map?.widthPx || !hole.map?.heightPx) && imageUrl
          ? await getImageDimensionsFromUrl(imageUrl)
          : null;
        return {
          ...hole,
          map: {
            ...(hole.map || {}),
            image: imageUrl || undefined,
            widthPx: hole.map?.widthPx || fallbackDimensions?.widthPx || undefined,
            heightPx: hole.map?.heightPx || fallbackDimensions?.heightPx || undefined
            // Note: metersPerPixel is preserved from imported calibration.json if present
          }
        };
      }));
      
      return enriched;
    } catch (error) {
      console.error(`Failed to load imported holes for ${courseId}:`, error);
      // Fall through to bundled data as fallback
    }
  }
  
  // Fall back to bundled data/holes/{courseId}.json
  try {
    const response = await fetch(`data/holes/${encodeURIComponent(courseId)}.json`);
    if (!response.ok) {
      return [];  // Return empty array instead of throwing
    }
    const holes = await response.json();
    return holes || [];
  } catch (error) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      error.code = 'OFFLINE_UNCACHED';
    }
    console.error('Failed to load holes:', error);
    // Return empty array to allow import-first workflow
    return [];
  }
}

/**
 * Get a single hole by number
 * @param {Array} holes - Array of hole objects from loadHoles()
 * @param {number} holeNum - Hole number (1-18)
 * @returns {Object|null} Hole object or null if not found
 */
export function getHoleData(holes, holeNum) {
  return holes.find(h => h.hole === holeNum) || null;
}

/**
 * Build the URL for a hole detail page
 * @param {string} courseId - Course ID slug
 * @param {number} holeNum - Hole number (1-18)
 * @returns {string} URL string e.g. 'hole.html?id=bromma-gk&hole=7'
 */
export function buildHoleHref(courseId, holeNum) {
  return `hole.html?id=${encodeURIComponent(courseId)}&hole=${holeNum}`;
}
