import { normalizeRoundCatalog } from './roundCatalog.js'
import { normalizeQuestionCursor as normalizeQuestionCursorShared } from '../../shared/questionCursor.js'
import {
  normalizeGameplayMode,
  normalizeAnswerState,
  serializeAnswerState,
  buildInitialAnswerState,
} from './hostlessMode.js'

export function initialState() {
  return {
    teams: [],
    gameplayMode: 'hosted',
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
    reactionStats: {},
    answerState: buildInitialAnswerState(),
  }
}

export function serializeEligibilityState(st) {
  return { allowedTeamIndices: st.allowedTeamIndices ? [...st.allowedTeamIndices] : null }
}

export function serializeMemberSyncState(st) {
  return {
    gameplayMode: normalizeGameplayMode(st?.gameplayMode),
    answerState: serializeAnswerState(st?.answerState, st?.teams),
    armed: st.armed,
    buzzedBy: st.buzzedBy,
    buzzedMemberName: st.buzzedMemberName,
    ...serializeEligibilityState(st),
  }
}

export function serializeHostSyncState(st) {
  const teams = Array.isArray(st?.teams) ? st.teams : []
  const streaks = Array.isArray(st?.streaks)
    ? st.streaks.map((value) => {
      const parsed = Number.parseInt(value, 10)
      return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
    })
    : []
  const doneQuestions = Array.isArray(st?.doneQuestions)
    ? st.doneQuestions.map((value) => String(value || '').trim()).filter(Boolean)
    : []

  return {
    teams,
    gameplayMode: normalizeGameplayMode(st?.gameplayMode),
    answerState: serializeAnswerState(st?.answerState, teams),
    armed: Boolean(st?.armed),
    buzzedBy: Number.isInteger(st?.buzzedBy) ? st.buzzedBy : null,
    buzzedMemberName: st?.buzzedMemberName ? String(st.buzzedMemberName) : null,
    ...serializeEligibilityState(st || {}),
    hostQuestionCursor: normalizeQuestionCursor(st?.hostQuestionCursor),
    streaks,
    doneQuestions,
    doublePoints: Boolean(st?.doublePoints),
    gamePlan: normalizeGamePlan(st?.gamePlan),
    roundCatalog: normalizeRoundCatalog(st?.roundCatalog),
    reactionStats: normalizeReactionStats(st?.reactionStats),
  }
}

export { normalizeGameplayMode, normalizeAnswerState, serializeAnswerState }

export function normalizeQuestionCursor(rawCursor) {
  return normalizeQuestionCursorShared(rawCursor)
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

function cleanText(value, maxLen = 80) {
  return String(value || '').trim().slice(0, maxLen)
}

function cleanTeamIndex(value) {
  const parsed = Number.parseInt(value, 10)
  return Number.isInteger(parsed) ? parsed : -1
}

function cleanMs(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 0) return null
  return parsed
}

function cleanAttempts(value) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1) return null
  return parsed
}

export function normalizeReactionStats(rawStats) {
  if (!rawStats || typeof rawStats !== 'object' || Array.isArray(rawStats)) return {}
  const out = {}
  let count = 0
  for (const [rawKey, value] of Object.entries(rawStats)) {
    if (count >= 500) break
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue

    const fallbackKey = cleanText(rawKey, 120)
    const key = cleanText(value.key || fallbackKey, 120)
    const name = cleanText(value.name)
    const teamName = cleanText(value.teamName)
    const teamIndex = cleanTeamIndex(value.teamIndex)
    const bestMs = cleanMs(value.bestMs)
    const lastMs = cleanMs(value.lastMs)
    const questionLastMs = cleanMs(value.questionLastMs)
    const attempts = cleanAttempts(value.attempts)
    const bestQuestionLabel = cleanText(value.bestQuestionLabel, 20)
    const bestQuestionHeadline = cleanText(value.bestQuestionHeadline, 120)

    if (!key || !name) continue

    const safeLastMs = lastMs ?? bestMs
    const safeBestMs = bestMs ?? safeLastMs
    if (!Number.isInteger(safeBestMs) || !Number.isInteger(safeLastMs)) continue

    const safeAttempts = attempts ?? 1
    const totalMs = cleanMs(value.totalMs) ?? (safeLastMs * safeAttempts)

    out[key] = {
      key,
      name,
      teamName,
      teamIndex,
      bestMs: Math.min(safeBestMs, safeLastMs),
      lastMs: safeLastMs,
      questionLastMs,
      totalMs,
      attempts: safeAttempts,
      bestQuestionLabel: bestQuestionLabel || null,
      bestQuestionHeadline: bestQuestionHeadline || null,
    }
    count += 1
  }
  return out
}

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
