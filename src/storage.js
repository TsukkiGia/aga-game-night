export const TEAMS_KEY           = 'scorekeeping_teams'
export const SCORES_KEY          = 'scorekeeping_scores'
export const DONE_KEY            = 'scorekeeping_done'
export const HOST_PIN_KEY        = 'scorekeeping_host_pin'
export const SESSION_CODE_KEY    = 'scorekeeping_session_code'
export const ACTIVE_QUESTION_KEY = 'scorekeeping_active_question'

// Validates and normalizes a [roundIndex, questionIndex|null] cursor from storage or socket.
export function normalizeQuestionCursor(rawCursor) {
  if (rawCursor === null) return null
  if (!Array.isArray(rawCursor) || rawCursor.length !== 2) return null
  const [roundIndex, questionIndex] = rawCursor
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null
  if (questionIndex !== null && (!Number.isInteger(questionIndex) || questionIndex < 0)) return null
  return [roundIndex, questionIndex]
}

// Validates and normalizes a teams array loaded from localStorage.
export function normalizeSavedTeams(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) return null
  const normalized = raw.map((team) => {
    if (!team || typeof team !== 'object') return null
    const name = String(team.name || '').trim()
    const color = String(team.color || '').trim()
    const scoreNum = Number(team.score)
    const score = Number.isFinite(scoreNum) ? scoreNum : 0
    if (!name || !color) return null
    return { name, color, score }
  })
  if (normalized.some((team) => team === null)) return null
  return normalized
}

function currentSessionCode() {
  try {
    return (sessionStorage.getItem(SESSION_CODE_KEY) || '').trim().toUpperCase()
  } catch {
    return ''
  }
}

export function scopedKey(baseKey) {
  const code = currentSessionCode()
  return code ? `${baseKey}:${code}` : baseKey
}

export function getStorageItem(baseKey) {
  try {
    const scoped = scopedKey(baseKey)
    const scopedVal = localStorage.getItem(scoped)
    if (scopedVal !== null) return scopedVal
    return localStorage.getItem(baseKey)
  } catch {
    return null
  }
}

export function setStorageItem(baseKey, value) {
  try {
    localStorage.setItem(scopedKey(baseKey), value)
  } catch {
    // Ignore storage failures.
  }
}

export function removeStorageItem(baseKey) {
  try {
    localStorage.removeItem(scopedKey(baseKey))
    localStorage.removeItem(baseKey) // legacy key cleanup
  } catch {
    // Ignore storage failures.
  }
}

export function loadScores(initialTeams) {
  try {
    const saved = JSON.parse(getStorageItem(SCORES_KEY) || '{}')
    return initialTeams.map((t, i) => ({ ...t, score: saved[i] ?? t.score }))
  } catch {
    return initialTeams
  }
}

export function loadDone() {
  try {
    return new Set(JSON.parse(getStorageItem(DONE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export function clearAll() {
  removeStorageItem(TEAMS_KEY)
  removeStorageItem(SCORES_KEY)
  removeStorageItem(DONE_KEY)
  removeStorageItem(ACTIVE_QUESTION_KEY)
}
