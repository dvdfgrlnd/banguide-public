/**
 * Club Storage Module — localStorage-backed club set management.
 * Storage key: banguide_clubs_v1
 */

const STORAGE_KEY = 'banguide_clubs_v1';

export const DEFAULT_CLUBS = [
  { name: 'Driver', meters: 229 },
  { name: '3-wood', meters: 201 },
  { name: '5-iron', meters: 169 },
  { name: '7-iron', meters: 142 },
  { name: '9-iron', meters: 119 },
  { name: 'Pitching wedge', meters: 101 },
  { name: 'Gap wedge', meters: 87 },
  { name: 'Sand wedge', meters: 73 },
  { name: 'Lob wedge', meters: 59 },
  { name: 'Putter', meters: 18 },
];

function normalizeClubs(clubs) {
  return [...clubs].sort((left, right) => Number(right.meters) - Number(left.meters));
}

function persistClubs(clubs) {
  const normalizedClubs = normalizeClubs(clubs);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedClubs));
  return normalizedClubs;
}

export function loadClubs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeClubs(DEFAULT_CLUBS);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return normalizeClubs(DEFAULT_CLUBS);
    return normalizeClubs(parsed);
  } catch {
    return normalizeClubs(DEFAULT_CLUBS);
  }
}

export function saveClubs(clubs) {
  persistClubs(clubs);
}

export function addClub(name, meters) {
  const clubs = loadClubs();
  clubs.push({ name: String(name).trim(), meters: Number(meters) });
  return persistClubs(clubs);
}

export function updateClub(index, name, meters) {
  const clubs = loadClubs();
  if (index < 0 || index >= clubs.length) return clubs;
  clubs[index] = { name: String(name).trim(), meters: Number(meters) };
  return persistClubs(clubs);
}

export function deleteClub(index) {
  const clubs = loadClubs();
  if (clubs.length <= 1) return clubs; // Preserve at least one club
  clubs.splice(index, 1);
  return persistClubs(clubs);
}
