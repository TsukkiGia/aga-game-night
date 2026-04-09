export const TEAMS_KEY           = 'scorekeeping_teams'
export const SCORES_KEY          = 'scorekeeping_scores'
export const DONE_KEY            = 'scorekeeping_done'
export const HOST_PIN_KEY        = 'scorekeeping_host_pin'
export const SESSION_CODE_KEY    = 'scorekeeping_session_code'
export const ACTIVE_QUESTION_KEY = 'scorekeeping_active_question'
export const GAME_PLAN_KEY       = 'scorekeeping_game_plan'
export const BUZZER_PLAYER_KEY   = 'sankofa_player'

// Validates and normalizes a cursor from storage or socket.
export function normalizeQuestionCursor(rawCursor) {
  if (rawCursor === null) return null
  if (typeof rawCursor === 'string') {
    const normalized = rawCursor.trim()
    return normalized || null
  }
  if (rawCursor && typeof rawCursor === 'object' && !Array.isArray(rawCursor)) {
    const normalized = String(rawCursor.itemId || '').trim()
    return normalized || null
  }
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
    return (localStorage.getItem(SESSION_CODE_KEY) || '').trim().toUpperCase()
  } catch {
    return ''
  }
}

export function scopedKey(baseKey) {
  if (baseKey === SESSION_CODE_KEY) return SESSION_CODE_KEY
  const code = currentSessionCode()
  return code ? `${baseKey}:${code}` : baseKey
}

export function getStorageItem(baseKey) {
  try {
    const scoped = scopedKey(baseKey)
    return localStorage.getItem(scoped)
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

export function readHostCredentials() {
  const sessionCode = (getStorageItem(SESSION_CODE_KEY) || '').trim().toUpperCase()
  const pin = (getStorageItem(HOST_PIN_KEY) || '').trim()
  if (!sessionCode || !pin) return null
  return { sessionCode, pin }
}

export function writeHostCredentials(sessionCode, pin) {
  const normalizedCode = String(sessionCode || '').trim().toUpperCase()
  const normalizedPin = String(pin || '').trim()
  if (!normalizedCode || !normalizedPin) return
  setStorageItem(SESSION_CODE_KEY, normalizedCode)
  setStorageItem(HOST_PIN_KEY, normalizedPin)
}

export function clearHostCredentials() {
  const existingCode = (readHostCredentials()?.sessionCode || '').trim().toUpperCase()
  if (existingCode) {
    try {
      localStorage.removeItem(`${HOST_PIN_KEY}:${existingCode}`)
    } catch {
      // Ignore storage failures.
    }
  }
  removeStorageItem(HOST_PIN_KEY)
  removeStorageItem(SESSION_CODE_KEY)
}

function buzzerKey(sessionCode) {
  return sessionCode ? `${BUZZER_PLAYER_KEY}:${sessionCode}` : BUZZER_PLAYER_KEY
}

export function loadBuzzerIdentity(sessionCode) {
  try {
    return JSON.parse(localStorage.getItem(buzzerKey(sessionCode)))
  } catch {
    return null
  }
}

export function saveBuzzerIdentity(teamIndex, name, sessionCode) {
  try {
    localStorage.setItem(buzzerKey(sessionCode), JSON.stringify({ teamIndex, name }))
  } catch {
    // Ignore storage failures.
  }
}

export function clearBuzzerIdentity(sessionCode) {
  try {
    localStorage.removeItem(buzzerKey(sessionCode))
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
  removeStorageItem(GAME_PLAN_KEY)
  removeStorageItem(ACTIVE_QUESTION_KEY)
}
