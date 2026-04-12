import { normalizeRoundCatalog } from './roundCatalog.js'

export function initialState() {
  return {
    teams: [],
    armed: false,
    armedAtMs: null,
    lastArmAtMs: null,
    attemptedSocketIds: new Set(),
    buzzedBy: null,
    buzzedMemberName: null,
    allowedTeamIndices: null,
    members: {},
    hostQuestionCursor: null,
    streaks: [],
    doneQuestions: [],
    doublePoints: false,
    gamePlan: [],
    roundCatalog: [],
  }
}

export function serializeEligibilityState(st) {
  return { allowedTeamIndices: st.allowedTeamIndices ? [...st.allowedTeamIndices] : null }
}

export function serializeMemberSyncState(st) {
  return {
    armed: st.armed,
    buzzedBy: st.buzzedBy,
    buzzedMemberName: st.buzzedMemberName,
    ...serializeEligibilityState(st),
  }
}

export function normalizeQuestionCursor(rawCursor) {
  if (rawCursor === null) return null
  if (typeof rawCursor === 'string') {
    const normalized = rawCursor.trim()
    return normalized || null
  }
  if (!Array.isArray(rawCursor) || rawCursor.length !== 2) return null
  const [roundIndex, questionIndex] = rawCursor
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null
  if (questionIndex !== null && (!Number.isInteger(questionIndex) || questionIndex < 0)) return null
  return [roundIndex, questionIndex]
}

export function normalizeGamePlan(rawPlan) {
  if (!Array.isArray(rawPlan)) return []
  const normalized = []
  const seen = new Set()
  for (const value of rawPlan) {
    const id = String(value || '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push(id)
    if (normalized.length >= 500) break
  }
  return normalized
}

export { normalizeRoundCatalog }

export function normalizeTeams(rawTeams) {
  if (!Array.isArray(rawTeams)) return null
  if (rawTeams.length < 1 || rawTeams.length > 8) return null
  const normalized = rawTeams.map((team) => {
    if (!team || typeof team !== 'object') return null
    const name = String(team.name || '').trim()
    const color = String(team.color || '').trim()
    const scoreNum = Number(team.score)
    const score = Number.isFinite(scoreNum) ? Math.round(scoreNum) : 0
    if (!name || !color) return null
    return { name, color, score }
  })
  if (normalized.some(t => t === null)) return null
  return normalized
}

export function normalizeAllowedTeamIndices(rawIndices, teamCount) {
  if (rawIndices === undefined || rawIndices === null) return null
  if (!Array.isArray(rawIndices)) return null
  const next = new Set()
  for (const value of rawIndices) {
    if (!Number.isInteger(value)) continue
    if (value < 0 || value >= teamCount) continue
    next.add(value)
  }
  return next
}
