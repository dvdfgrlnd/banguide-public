/**
 * Imported Data Module — Browser storage adapter for imported courses
 * ES module for client-side course import, parsing, and persistence.
 *
 * Uses IndexedDB for courses, holes, and image blobs keyed by courseId.
 * Supports 1-4+ tee mapping with priority: white > yellow > blue > red
 */

import { expandImportFiles } from './archive-import.js';

const DB_NAME = 'banguide-imported';
const DB_VERSION = 1;
const COURSES_STORE = 'courses';
const HOLES_STORE = 'holes';
const IMAGES_STORE = 'images';

function basename(fileName) {
  return String(fileName || '').split('/').pop() || '';
}

/**
 * Initialize IndexedDB database if not exists
 * @returns {Promise<IDBDatabase>} The opened/created database
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      // Create object stores if they don't exist
      if (!db.objectStoreNames.contains(COURSES_STORE)) {
        db.createObjectStore(COURSES_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(HOLES_STORE)) {
        const holesStore = db.createObjectStore(HOLES_STORE, { keyPath: 'id', autoIncrement: true });
        holesStore.createIndex('courseId', 'courseId', { unique: false });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        const imagesStore = db.createObjectStore(IMAGES_STORE, { keyPath: 'id', autoIncrement: true });
        imagesStore.createIndex('courseId', 'courseId', { unique: false });
      }
    };
  });
}

/**
 * Map tee keys to tee names based on available tee count
 * Priority: white > yellow > blue > red
 * Handles 1-4+ tees
 * @param {Object} teesObject - Object with numeric tee keys and distance values
 * @returns {Object} Mapped tees with names as keys: { white?, yellow?, blue?, red? }
 */
function mapTees(teesObject) {
  const teesArray = Object.entries(teesObject)
    .map(([key, value]) => ({ key: parseInt(key), value }))
    .sort((a, b) => b.key - a.key); // Descending order
  
  const mapped = {};
  const teeCount = teesArray.length;
  
  if (teeCount >= 4) {
    // 4+ tees: highest=white, next=yellow, next=blue, rest=red (take lowest)
    mapped.white = teesArray[0].value;
    mapped.yellow = teesArray[1].value;
    mapped.blue = teesArray[2].value;
    mapped.red = teesArray[teeCount - 1].value;
  } else if (teeCount === 3) {
    // 3 tees: highest=white, next=yellow, lowest=red
    mapped.white = teesArray[0].value;
    mapped.yellow = teesArray[1].value;
    mapped.red = teesArray[2].value;
  } else if (teeCount === 2) {
    // 2 tees: highest=yellow, lowest=red (special case: 57->yellow, 46->red, etc.)
    mapped.yellow = teesArray[0].value;
    mapped.red = teesArray[1].value;
  } else if (teeCount === 1) {
    // 1 tee: map to yellow as playable default
    mapped.yellow = teesArray[0].value;
  }
  
  return mapped;
}

/**
 * Normalize hole data from import format to runtime format
 * @param {Object} sourceHole - Hole object from holes.json with { hole, par, index, tees }
 * @param {string} courseId - Course ID for reference
 * @param {Object} calibrationByHole - Optional map of hole_num → metersPerPixel values
 * @param {Object} orientationByHole - Optional map of hole_num → orientation (degrees) values
 * @returns {Object} Normalized hole object for runtime consumption
 */
function normalizeHole(sourceHole, courseId, calibrationByHole = {}, orientationByHole = {}) {
  const mapped = mapTees(sourceHole.tees);

  return {
    hole: sourceHole.hole,
    par: sourceHole.par,
    strokeIndex: sourceHole.index,
    courseId: courseId,
    // Runtime distances: include white when available (4+ tees)
    distances: {
      white: mapped.white || undefined,
      blue: mapped.blue || undefined,
      yellow: mapped.yellow || undefined,
      red: mapped.red || undefined
    },
    // Map metadata with optional calibration and orientation
    map: {
      // image reference will be set by caller
      // widthPx and heightPx will be known after image loads
      metersPerPixel: calibrationByHole[sourceHole.hole] || undefined,
      orientation: orientationByHole[sourceHole.hole] || undefined
    }
  };
}

/**
 * Parse holes.json from FileList
 * @param {FileList} files - Browser FileList from import
 * @returns {Promise<Array>} Array of source hole objects
 */
async function parseHolesJson(files) {
  let holesJsonFile = null;
  
  for (let file of files) {
    if (basename(file.__archivePath || file.name) === 'holes.json') {
      holesJsonFile = file;
      break;
    }
  }
  
  if (!holesJsonFile) {
    throw new Error('holes.json not found in import package');
  }
  
  const text = await holesJsonFile.text();
  const holes = JSON.parse(text);
  
  if (!Array.isArray(holes)) {
    throw new Error('holes.json must contain an array');
  }
  
  return holes;
}

/**
 * Extract image files from FileList, keyed by hole number
 * Accepts jpg, jpeg, png formats
 * @param {FileList} files - Browser FileList from import
 * @returns {Object} Map of hole number to File object
 */
function extractImages(files) {
  const imagesByHole = {};
  const imagePattern = /^hole[-_](\d+)\.(jpg|jpeg|png)$/i;
  
  for (let file of files) {
    const match = basename(file.__archivePath || file.name).match(imagePattern);
    if (match) {
      const holeNum = parseInt(match[1]);
      imagesByHole[holeNum] = file;
    }
  }
  
  return imagesByHole;
}

/**
 * Parse calibration.json from FileList
 * @param {FileList} files - Browser FileList from import
 * @returns {Promise<Object>} Map of hole_num → metersPerPixel
 */
async function parseCalibrationJson(files) {
  let calibrationJsonFile = null;
  
  for (let file of files) {
    if (basename(file.__archivePath || file.name) === 'calibration.json') {
      calibrationJsonFile = file;
      break;
    }
  }
  
  if (!calibrationJsonFile) {
    return {}; // Calibration is optional
  }
  
  try {
    const text = await calibrationJsonFile.text();
    const calibrationData = JSON.parse(text);

    if (!calibrationData || typeof calibrationData !== 'object' || Array.isArray(calibrationData)) {
      throw new Error('calibration.json must contain an object keyed by hole, e.g. hole_1');
    }

    // Map hole numbers to metersPerPixel values for runtime compatibility
    const byHole = {};
    for (const [holeKey, item] of Object.entries(calibrationData)) {
      if (!item || typeof item !== 'object') {
        throw new Error(`calibration.json entry ${holeKey} must be an object`);
      }

      if (typeof item.hole_num !== 'number' || typeof item.meters_per_pixel !== 'number') {
        throw new Error(`calibration.json entry ${holeKey} must include numeric hole_num and meters_per_pixel`);
      }

      if (!Array.isArray(item.raw_m_per_px_samples) || !Array.isArray(item.filtered_m_per_px_samples) || !Array.isArray(item.pair_details)) {
        throw new Error(`calibration.json entry ${holeKey} must include arrays: raw_m_per_px_samples, filtered_m_per_px_samples, pair_details`);
      }

      byHole[item.hole_num] = item.meters_per_pixel;
    }
    
    return byHole;
  } catch (error) {
    throw new Error(`Failed to parse calibration.json: ${error.message}`);
  }
}

/**
 * Parse orientation.json from FileList
 * @param {FileList} files - Browser FileList from import
 * @returns {Promise<Object>} Map of hole_num → orientation (degrees)
 */
async function parseOrientationJson(files) {
  let orientationJsonFile = null;

  for (let file of files) {
    if (basename(file.__archivePath || file.name) === 'orientation.json') {
      orientationJsonFile = file;
      break;
    }
  }

  if (!orientationJsonFile) {
    return {}; // Orientation is optional
  }

  try {
    const text = await orientationJsonFile.text();
    const orientationData = JSON.parse(text);

    if (!orientationData || typeof orientationData !== 'object' || Array.isArray(orientationData)) {
      throw new Error('orientation.json must contain an object keyed by hole, e.g. hole_1');
    }

    // Map hole numbers to orientation values for runtime compatibility
    const byHole = {};
    for (const [holeKey, item] of Object.entries(orientationData)) {
      if (!item || typeof item !== 'object') {
        throw new Error(`orientation.json entry ${holeKey} must be an object`);
      }

      if (typeof item.hole_num !== 'number' || typeof item.clockwise_from_template_up_deg !== 'number') {
        throw new Error(`orientation.json entry ${holeKey} must include numeric hole_num and clockwise_from_template_up_deg`);
      }

      byHole[item.hole_num] = item.clockwise_from_template_up_deg;
    }

    return byHole;
  } catch (error) {
    throw new Error(`Failed to parse orientation.json: ${error.message}`);
  }
}

/**
 * Import and persist a course package from browser FileList
 * @param {FileList} files - Browser-selected course package files
 * @param {string} courseId - ID for the imported course (e.g., 'my-course-import')
 * @param {string} courseName - Display name for the imported course
 * @returns {Promise<{courseId, courseName, holeCount}>} Import result
 */
export async function importAndPersistCourse(files, courseId, courseName) {
  if (!files || files.length === 0) {
    throw new Error('No files selected');
  }

  const importFiles = await expandImportFiles(files);
  if (!importFiles || importFiles.length === 0) {
    throw new Error('No files found in import package');
  }

  const db = await initDB();

  // Parse holes.json
  const sourceHoles = await parseHolesJson(importFiles);

  // Extract image files
  const imagesByHole = extractImages(importFiles);

  // Parse calibration.json (optional)
  const calibrationByHole = await parseCalibrationJson(importFiles);

  // Parse orientation.json (optional)
  const orientationByHole = await parseOrientationJson(importFiles);
  
  // Validate package has holes and at least one hole has an image
  if (sourceHoles.length === 0) {
    throw new Error('No holes found in holes.json');
  }
  
  // Check for at least one image
  if (Object.keys(imagesByHole).length === 0) {
    throw new Error('No hole images found in import package');
  }
  
  // Store course metadata
  const courseRecord = {
    id: courseId,
    name: courseName,
    holeCount: sourceHoles.length,
    importedAt: new Date().toISOString()
  };
  
  await new Promise((resolve, reject) => {
    const tx = db.transaction([COURSES_STORE], 'readwrite');
    const store = tx.objectStore(COURSES_STORE);
    const request = store.put(courseRecord);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
  
  // Normalize and store holes
  for (const sourceHole of sourceHoles) {
    const normalized = normalizeHole(sourceHole, courseId, calibrationByHole, orientationByHole);
    
    await new Promise((resolve, reject) => {
      const tx = db.transaction([HOLES_STORE], 'readwrite');
      const store = tx.objectStore(HOLES_STORE);
      const request = store.add(normalized);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  
  // Store image blobs
  for (const [holeNum, imageFile] of Object.entries(imagesByHole)) {
    const blob = imageFile; // File extends Blob; safe to persist directly
    const imageRecord = {
      courseId: courseId,
      hole: parseInt(holeNum),
      filename: imageFile.name,
      blob: blob,
      size: blob.size,
      type: blob.type,
      storedAt: new Date().toISOString()
    };
    
    await new Promise((resolve, reject) => {
      const tx = db.transaction([IMAGES_STORE], 'readwrite');
      const store = tx.objectStore(IMAGES_STORE);
      const request = store.add(imageRecord);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
  
  return {
    courseId,
    courseName,
    holeCount: sourceHoles.length,
    imageCount: Object.keys(imagesByHole).length,
    importedAt: courseRecord.importedAt
  };
}

/**
 * Load all imported courses from browser storage
 * @returns {Promise<Array>} Array of course records
 */
export async function loadImportedCourses() {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([COURSES_STORE], 'readonly');
    const store = tx.objectStore(COURSES_STORE);
    const request = store.getAll();
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

/**
 * Get a specific imported course by ID
 * @param {string} courseId - Course ID
 * @returns {Promise<Object|null>} Course record or null if not found
 */
export async function getImportedCourse(courseId) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([COURSES_STORE], 'readonly');
    const store = tx.objectStore(COURSES_STORE);
    const request = store.get(courseId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result || null);
  });
}

/**
 * Load holes for an imported course
 * @param {string} courseId - Course ID
 * @returns {Promise<Array>} Array of normalized hole objects
 */
export async function loadImportedHoles(courseId) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([HOLES_STORE], 'readonly');
    const store = tx.objectStore(HOLES_STORE);
    const index = store.index('courseId');
    const request = index.getAll(courseId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      // Sort by hole number
      const holes = request.result.sort((a, b) => a.hole - b.hole);
      resolve(holes);
    };
  });
}

/**
 * Get image blob for a hole in an imported course
 * @param {string} courseId - Course ID
 * @param {number} holeNum - Hole number
 * @returns {Promise<Blob|null>} Image blob or null if not found
 */
export async function getImportedHoleImage(courseId, holeNum) {
  const db = await initDB();
  
  return new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGES_STORE], 'readonly');
    const store = tx.objectStore(IMAGES_STORE);
    const index = store.index('courseId');
    const request = index.getAll(courseId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const images = request.result;
      const image = images.find(img => img.hole === holeNum);
      resolve(image?.blob || null);
    };
  });
}

/**
 * Create an object URL for an imported hole image
 * Useful for setting as src on img elements
 * @param {string} courseId - Course ID
 * @param {number} holeNum - Hole number
 * @returns {Promise<string|null>} Object URL or null if image not found
 */
export async function getImportedHoleImageURL(courseId, holeNum) {
  const blob = await getImportedHoleImage(courseId, holeNum);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/**
 * Delete an imported course and all its related data
 * @param {string} courseId - Course ID to delete
 * @returns {Promise<void>}
 */
export async function deleteImportedCourse(courseId) {
  const db = await initDB();
  
  // Delete course
  await new Promise((resolve, reject) => {
    const tx = db.transaction([COURSES_STORE], 'readwrite');
    const store = tx.objectStore(COURSES_STORE);
    const request = store.delete(courseId);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
  
  // Delete holes for this course
  await new Promise((resolve, reject) => {
    const tx = db.transaction([HOLES_STORE], 'readwrite');
    const store = tx.objectStore(HOLES_STORE);
    const index = store.index('courseId');
    const request = index.openCursor(courseId);
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
  
  // Delete images for this course
  await new Promise((resolve, reject) => {
    const tx = db.transaction([IMAGES_STORE], 'readwrite');
    const store = tx.objectStore(IMAGES_STORE);
    const index = store.index('courseId');
    const request = index.openCursor(courseId);
    request.onerror = () => reject(request.error);
    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      } else {
        resolve();
      }
    };
  });
}
