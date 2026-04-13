const STORAGE_KEY = 'banguide_scorecards_v1';

function createEmptyStore() {
  return {
    rounds: [],
    activeRoundByCourse: {},
  };
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeRound(round) {
  if (!round || typeof round !== 'object') {
    return null;
  }

  const id = String(round.id || '').trim();
  const courseId = String(round.courseId || '').trim();
  if (!id || !courseId) {
    return null;
  }

  const scoresSource = isPlainObject(round.scores) ? round.scores : {};
  const scores = {};

  Object.entries(scoresSource).forEach(([holeNumber, strokes]) => {
    const normalizedHole = Number.parseInt(holeNumber, 10);
    const normalizedStrokes = Number.parseInt(strokes, 10);
    if (Number.isInteger(normalizedHole) && normalizedHole > 0 && Number.isInteger(normalizedStrokes) && normalizedStrokes > 0) {
      scores[String(normalizedHole)] = normalizedStrokes;
    }
  });

  return {
    id,
    courseId,
    name: String(round.name || 'Round').trim() || 'Round',
    holeCount: Number.parseInt(round.holeCount, 10) || 0,
    createdAt: String(round.createdAt || new Date().toISOString()),
    updatedAt: String(round.updatedAt || round.createdAt || new Date().toISOString()),
    scores,
  };
}

function normalizeStore(store) {
  const normalized = createEmptyStore();

  if (!store || typeof store !== 'object') {
    return normalized;
  }

  if (Array.isArray(store.rounds)) {
    normalized.rounds = store.rounds
      .map(normalizeRound)
      .filter(Boolean);
  }

  if (isPlainObject(store.activeRoundByCourse)) {
    Object.entries(store.activeRoundByCourse).forEach(([courseId, roundId]) => {
      if (typeof roundId === 'string' && roundId.trim()) {
        normalized.activeRoundByCourse[String(courseId)] = roundId.trim();
      }
    });
  }

  return normalized;
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createEmptyStore();
    }
    return normalizeStore(JSON.parse(raw));
  } catch {
    return createEmptyStore();
  }
}

function writeStore(store) {
  const normalized = normalizeStore(store);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function sortRounds(rounds) {
  return [...rounds].sort((left, right) => {
    const rightTime = Date.parse(right.updatedAt) || 0;
    const leftTime = Date.parse(left.updatedAt) || 0;
    return rightTime - leftTime;
  });
}

function buildRoundId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `round-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function findRoundIndex(store, courseId, roundId) {
  return store.rounds.findIndex((round) => round.courseId === courseId && round.id === roundId);
}

function getHolePar(hole) {
  const par = Number.parseInt(hole?.par, 10);
  return Number.isInteger(par) && par > 0 ? par : null;
}

export function listCourseRounds(courseId) {
  const store = readStore();
  return sortRounds(store.rounds.filter((round) => round.courseId === courseId));
}

export function getActiveRound(courseId) {
  const store = readStore();
  const rounds = sortRounds(store.rounds.filter((round) => round.courseId === courseId));
  if (rounds.length === 0) {
    return null;
  }

  const activeRoundId = store.activeRoundByCourse[courseId];
  const activeRound = rounds.find((round) => round.id === activeRoundId) || rounds[0];

  if (activeRound && activeRound.id !== activeRoundId) {
    store.activeRoundByCourse[courseId] = activeRound.id;
    writeStore(store);
  }

  return activeRound;
}

export function setActiveRound(courseId, roundId) {
  const store = readStore();
  const roundExists = store.rounds.some((round) => round.courseId === courseId && round.id === roundId);
  if (!roundExists) {
    return getActiveRound(courseId);
  }

  store.activeRoundByCourse[courseId] = roundId;
  writeStore(store);
  return getActiveRound(courseId);
}

export function createRound(courseId, holeCount) {
  const store = readStore();
  const existingCount = store.rounds.filter((round) => round.courseId === courseId).length;
  const timestamp = new Date().toISOString();
  const round = {
    id: buildRoundId(),
    courseId,
    name: `Round ${existingCount + 1}`,
    holeCount: Number.parseInt(holeCount, 10) || 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    scores: {},
  };

  store.rounds.push(round);
  store.activeRoundByCourse[courseId] = round.id;
  writeStore(store);
  return round;
}

export function updateRoundHoleStrokes(courseId, roundId, holeNumber, strokes) {
  const store = readStore();
  const roundIndex = findRoundIndex(store, courseId, roundId);
  if (roundIndex === -1) {
    return getActiveRound(courseId);
  }

  const normalizedHole = Number.parseInt(holeNumber, 10);
  if (!Number.isInteger(normalizedHole) || normalizedHole <= 0) {
    return store.rounds[roundIndex];
  }

  const nextRound = {
    ...store.rounds[roundIndex],
    scores: { ...store.rounds[roundIndex].scores },
    updatedAt: new Date().toISOString(),
  };

  const normalizedStrokes = Number.parseInt(strokes, 10);
  if (Number.isInteger(normalizedStrokes) && normalizedStrokes > 0) {
    nextRound.scores[String(normalizedHole)] = normalizedStrokes;
  } else {
    delete nextRound.scores[String(normalizedHole)];
  }

  store.rounds[roundIndex] = nextRound;
  store.activeRoundByCourse[courseId] = nextRound.id;
  writeStore(store);
  return nextRound;
}

export function getRoundSummary(holes, round) {
  const sortedHoles = [...holes].sort((left, right) => left.hole - right.hole);
  return sortedHoles.reduce((summary, hole) => {
    const par = getHolePar(hole);
    const strokes = Number.parseInt(round?.scores?.[String(hole.hole)], 10);

    if (par !== null) {
      summary.parTotal += par;
    }

    if (Number.isInteger(strokes) && strokes > 0) {
      summary.strokesTotal += strokes;
      summary.holesPlayed += 1;
    }

    return summary;
  }, {
    parTotal: 0,
    strokesTotal: 0,
    holesPlayed: 0,
    holeCount: sortedHoles.length,
  });
}

export function getScorecardSections(holes, round) {
  const sortedHoles = [...holes].sort((left, right) => left.hole - right.hole);
  const groups = [sortedHoles.slice(0, 9), sortedHoles.slice(9)];

  return groups
    .filter((group) => group.length > 0)
    .map((group, index) => {
      const label = index === 0 ? 'Out' : 'In';
      const parTotal = group.reduce((total, hole) => total + (getHolePar(hole) || 0), 0);
      const strokeValues = group.map((hole) => Number.parseInt(round?.scores?.[String(hole.hole)], 10));
      const strokeTotal = strokeValues.reduce((total, strokes) => total + (Number.isInteger(strokes) && strokes > 0 ? strokes : 0), 0);

      return {
        label,
        holes: group,
        parTotal,
        strokeTotal,
      };
    });
}