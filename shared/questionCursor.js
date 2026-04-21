function normalizeText(value) {
  return String(value || '').trim()
}

export function isLegacyQuestionCursorPair(value) {
  return Array.isArray(value) && value.length === 2
}

export function normalizeQuestionCursor(rawCursor, options = {}) {
  const allowObjectItemId = options?.allowObjectItemId === true
  if (rawCursor === null) return null
  if (typeof rawCursor === 'string') {
    const normalized = normalizeText(rawCursor)
    return normalized || null
  }
  if (allowObjectItemId && rawCursor && typeof rawCursor === 'object' && !Array.isArray(rawCursor)) {
    const normalized = normalizeText(rawCursor.itemId)
    return normalized || null
  }
  if (!isLegacyQuestionCursorPair(rawCursor)) return null
  const [roundIndex, questionIndex] = rawCursor
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null
  if (questionIndex !== null && (!Number.isInteger(questionIndex) || questionIndex < 0)) return null
  return [roundIndex, questionIndex]
}

export function buildQuestionCursorId(roundId, questionId) {
  const safeRoundId = normalizeText(roundId)
  const safeQuestionId = normalizeText(questionId)
  if (!safeRoundId || !safeQuestionId) return null
  return `q:${safeRoundId}:${safeQuestionId}`
}

export function buildRoundIntroCursorId(roundId) {
  const safeRoundId = normalizeText(roundId)
  if (!safeRoundId) return null
  return `intro:${safeRoundId}`
}

export function splitQuestionCursor(cursorId) {
  const raw = normalizeText(cursorId)
  if (!raw.startsWith('q:')) return null
  const firstSeparator = raw.indexOf(':', 2)
  if (firstSeparator < 0 || firstSeparator >= raw.length - 1) return null
  const roundId = raw.slice(2, firstSeparator)
  const questionId = raw.slice(firstSeparator + 1)
  if (!roundId || !questionId) return null
  return { roundId, questionId }
}

export function parseRoundIntroCursor(cursorId) {
  const raw = normalizeText(cursorId)
  if (!raw.startsWith('intro:')) return null
  const roundId = normalizeText(raw.slice('intro:'.length))
  if (!roundId) return null
  return { roundId, cursorId: raw }
}
