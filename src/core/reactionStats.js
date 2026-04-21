const MAX_REACTION_PLAYERS = 500

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

function normalizeReactionStatEntry(rawKey, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const fallbackKey = cleanText(rawKey, 120)
  const key = cleanText(value.key || fallbackKey, 120)
  const name = cleanText(value.name)
  const teamName = cleanText(value.teamName)
  const teamIndex = cleanTeamIndex(value.teamIndex)
  const bestMs = cleanMs(value.bestMs)
  const lastMs = cleanMs(value.lastMs)
  const questionLastMs = cleanMs(value.questionLastMs)
  const attempts = cleanAttempts(value.attempts)

  if (!key || !name) return null

  const safeLastMs = lastMs ?? bestMs
  const safeBestMs = bestMs ?? safeLastMs
  if (!Number.isInteger(safeBestMs) || !Number.isInteger(safeLastMs)) return null

  const safeAttempts = attempts ?? 1
  const fallbackTotal = safeLastMs * safeAttempts
  const rawTotal = cleanMs(value.totalMs)
  const totalMs = rawTotal ?? fallbackTotal

  return {
    key,
    name,
    teamName,
    teamIndex,
    bestMs: Math.min(safeBestMs, safeLastMs),
    lastMs: safeLastMs,
    questionLastMs,
    totalMs,
    attempts: safeAttempts,
    bestQuestionLabel: cleanText(value.bestQuestionLabel, 20) || null,
    bestQuestionHeadline: cleanText(value.bestQuestionHeadline, 120) || null,
  }
}

export function normalizeReactionStats(rawStats) {
  if (!rawStats || typeof rawStats !== 'object' || Array.isArray(rawStats)) return {}
  const out = {}
  let count = 0
  for (const [rawKey, value] of Object.entries(rawStats)) {
    if (count >= MAX_REACTION_PLAYERS) break
    const normalized = normalizeReactionStatEntry(rawKey, value)
    if (!normalized) continue
    out[normalized.key] = normalized
    count += 1
  }
  return out
}

export function updateReactionStatsWithAttempt(prevStats, buzzAttemptData) {
  const prev = normalizeReactionStats(prevStats)
  if (!buzzAttemptData?.memberName) return prev
  if (!Number.isFinite(buzzAttemptData.reactionMs)) return prev

  const name = cleanText(buzzAttemptData.memberName)
  if (!name) return prev

  const teamIndex = Number.isInteger(buzzAttemptData.teamIndex) ? buzzAttemptData.teamIndex : -1
  const teamName = cleanText(buzzAttemptData.team?.name)
  const key = `${teamIndex}:${name.toLowerCase()}`
  const ms = Math.max(0, Math.round(buzzAttemptData.reactionMs))

  const questionLabel = cleanText(buzzAttemptData.questionLabel, 20) || null
  const questionHeadline = cleanText(buzzAttemptData.questionHeadline, 120) || null

  const current = prev[key]
  if (!current) {
    return {
      ...prev,
      [key]: {
        key,
        name,
        teamName,
        teamIndex,
        bestMs: ms,
        lastMs: ms,
        questionLastMs: ms,
        totalMs: ms,
        attempts: 1,
        bestQuestionLabel: questionLabel,
        bestQuestionHeadline: questionHeadline,
      },
    }
  }

  const newBest = ms < current.bestMs
  return {
    ...prev,
    [key]: {
      ...current,
      teamName,
      teamIndex,
      bestMs: newBest ? ms : current.bestMs,
      lastMs: ms,
      questionLastMs: ms,
      totalMs: current.totalMs + ms,
      attempts: current.attempts + 1,
      bestQuestionLabel: newBest ? questionLabel : current.bestQuestionLabel,
      bestQuestionHeadline: newBest ? questionHeadline : current.bestQuestionHeadline,
    },
  }
}

export function clearQuestionLastFromReactionStats(prevStats) {
  const prev = normalizeReactionStats(prevStats)
  const out = {}
  let changed = false
  for (const [key, value] of Object.entries(prev)) {
    if (Number.isInteger(value.questionLastMs)) {
      out[key] = { ...value, questionLastMs: null }
      changed = true
    } else {
      out[key] = value
    }
  }
  return changed ? out : prev
}
