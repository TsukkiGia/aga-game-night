import {
  buildQuestionCursorId,
  buildRoundIntroCursorId,
  splitQuestionCursor,
  parseRoundIntroCursor,
} from '../../shared/questionCursor.js'

const HOSTED_MODE = 'hosted'
const HOSTLESS_MODE = 'hostless'
const SUPPORTED_GAMEPLAY_MODES = new Set([HOSTED_MODE, HOSTLESS_MODE])
const UNSUPPORTED_HOSTLESS_ROUND_TYPES = new Set(['charades', 'thesis'])
const TRIMMABLE_ANSWER_SUFFIXES = new Set([
  'rice',
  'soup',
  'stew',
  'sauce',
  'dish',
  'bread',
  'curry',
  'porridge',
  'salad',
])

const MAX_ATTEMPTS_IN_STATE = 24

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeRoundType(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeQuestionId(value) {
  const id = normalizeText(value)
  return id || null
}

function isQuestionCursorPair(value) {
  return Array.isArray(value) && value.length === 2
}

function roundAndQuestionFromPair(roundCatalog, pair) {
  if (!isQuestionCursorPair(pair)) return null
  const [roundIndex, questionIndex] = pair
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null
  const round = Array.isArray(roundCatalog) ? roundCatalog[roundIndex] : null
  if (!round || typeof round !== 'object') return null

  if (questionIndex === null) {
    return {
      itemType: 'round-intro',
      round,
      roundIndex,
      question: null,
      questionIndex: null,
      questionId: null,
      cursorId: buildRoundIntroCursorId(round?.id),
    }
  }

  if (!Number.isInteger(questionIndex) || questionIndex < 0) return null
  const question = Array.isArray(round.questions) ? round.questions[questionIndex] : null
  if (!question || typeof question !== 'object') return null
  const questionId = normalizeQuestionId(question.id) || `q-${questionIndex + 1}`
  return {
    itemType: 'question',
    round,
    roundIndex,
    question,
    questionIndex,
    questionId,
    cursorId: buildQuestionCursorId(round.id, questionId),
  }
}

function roundAndQuestionFromCursorId(roundCatalog, cursorId) {
  const raw = normalizeText(cursorId)
  if (!raw) return null

  const introCursor = parseRoundIntroCursor(raw)
  if (introCursor) {
    const { roundId, cursorId: normalizedCursorId } = introCursor
    const roundIndex = Array.isArray(roundCatalog)
      ? roundCatalog.findIndex((round) => normalizeText(round?.id) === roundId)
      : -1
    if (roundIndex < 0) return null
    const round = roundCatalog[roundIndex]
    return {
      itemType: 'round-intro',
      round,
      roundIndex,
      question: null,
      questionIndex: null,
      questionId: null,
      cursorId: normalizedCursorId,
    }
  }

  const parsed = splitQuestionCursor(raw)
  if (!parsed) return null
  const { roundId, questionId } = parsed
  const roundIndex = Array.isArray(roundCatalog)
    ? roundCatalog.findIndex((round) => normalizeText(round?.id) === roundId)
    : -1
  if (roundIndex < 0) return null

  const round = roundCatalog[roundIndex]
  const questions = Array.isArray(round?.questions) ? round.questions : []
  const questionIndex = questions.findIndex((question) => normalizeQuestionId(question?.id) === questionId)
  if (questionIndex < 0) return null

  return {
    itemType: 'question',
    round,
    roundIndex,
    question: questions[questionIndex],
    questionIndex,
    questionId,
    cursorId: raw,
  }
}


function hostlessExpectedAnswerForQuestion(roundType, question) {
  if (!question || typeof question !== 'object') return ''
  if (roundType === 'video') return normalizeText(question.answer)
  if (roundType === 'slang') return normalizeText(question.meaning)
  if (roundType === 'custom-buzz') return normalizeText(question.answer)
  return ''
}

function hostlessAcceptedAnswersForQuestion(question) {
  if (!question || typeof question !== 'object') return []
  if (!Array.isArray(question.acceptedAnswers)) return []
  const next = []
  const seen = new Set()
  for (const raw of question.acceptedAnswers) {
    const value = normalizeText(raw).slice(0, 240)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(value)
    if (next.length >= 20) break
  }
  return next
}

function dedupeAnswerVariants(values) {
  const out = []
  const seen = new Set()
  for (const raw of values) {
    const value = normalizeText(raw).slice(0, 240)
    if (!value) continue
    const key = normalizeGuessForMatch(value)
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= 60) break
  }
  return out
}

function stripLeadingFiller(value) {
  return normalizeText(value)
    .replace(/^(to|a|an|the)\s+/i, '')
    .replace(/^someone who\s+/i, '')
    .replace(/^the state of being\s+/i, '')
    .trim()
}

function deriveGenericSuffixAliases(answer) {
  const cleaned = normalizeText(answer)
  if (!cleaned) return []
  const words = cleaned.split(/\s+/).filter(Boolean)
  if (words.length < 2) return []
  const suffix = words[words.length - 1]?.toLowerCase()
  if (!TRIMMABLE_ANSWER_SUFFIXES.has(suffix)) return []
  const base = words.slice(0, -1).join(' ').trim()
  if (!base) return []
  return [base]
}

function deriveSlangMeaningAliases(meaning) {
  const cleaned = normalizeText(meaning)
  if (!cleaned) return []
  const variants = [cleaned]
  const withoutParens = cleaned.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim()
  if (withoutParens && withoutParens !== cleaned) variants.push(withoutParens)

  const fragments = []
  for (const value of variants) {
    value
      .split(/\s*\/\s*|\s*;\s*|\s*,\s*|\s+or\s+/i)
      .map((part) => stripLeadingFiller(part))
      .filter(Boolean)
      .forEach((part) => fragments.push(part))
  }
  return dedupeAnswerVariants(fragments)
}

function deriveImplicitAcceptedAnswers(roundType, question, expectedAnswer) {
  if (!question || typeof question !== 'object') return []
  const next = []
  if (roundType === 'slang') {
    next.push(...deriveSlangMeaningAliases(String(question.meaning || expectedAnswer || '')))
  }
  if (roundType === 'custom-buzz' || roundType === 'video') {
    next.push(...deriveGenericSuffixAliases(String(expectedAnswer || question.answer || '')))
  }
  return dedupeAnswerVariants(next)
}

export function normalizeGameplayMode(rawMode, fallback = HOSTED_MODE) {
  const normalized = normalizeText(rawMode).toLowerCase()
  if (SUPPORTED_GAMEPLAY_MODES.has(normalized)) return normalized
  return fallback
}

export function isHostlessMode(mode) {
  return normalizeGameplayMode(mode) === HOSTLESS_MODE
}

export function isHostlessRoundSupported(roundType) {
  const normalized = normalizeRoundType(roundType)
  if (!normalized) return false
  return !UNSUPPORTED_HOSTLESS_ROUND_TYPES.has(normalized)
}

export function resolveHostlessQuestionContext(st) {
  const roundCatalog = Array.isArray(st?.roundCatalog) ? st.roundCatalog : []
  const rawCursor = st?.hostQuestionCursor

  const baseContext = isQuestionCursorPair(rawCursor)
    ? roundAndQuestionFromPair(roundCatalog, rawCursor)
    : roundAndQuestionFromCursorId(roundCatalog, rawCursor)

  if (!baseContext) {
    return {
      itemType: 'none',
      round: null,
      roundIndex: null,
      question: null,
      questionIndex: null,
      questionId: null,
      cursorId: null,
      roundType: '',
      supportedRound: false,
      expectedAnswer: '',
      expectedAnswers: [],
      canAcceptAnswers: false,
      unsupportedReason: 'no-question',
    }
  }

  const roundType = normalizeRoundType(baseContext.round?.type)
  const supportedRound = isHostlessRoundSupported(roundType)
  const expectedAnswers = baseContext.itemType === 'question'
    ? (() => {
        const primary = hostlessExpectedAnswerForQuestion(roundType, baseContext.question)
        const aliases = hostlessAcceptedAnswersForQuestion(baseContext.question)
        const implicit = deriveImplicitAcceptedAnswers(roundType, baseContext.question, primary)
        const merged = dedupeAnswerVariants([primary, ...aliases, ...implicit])
        if (merged.length > 0) return merged
        if (!primary) return aliases
        return [primary, ...aliases]
      })()
    : []
  const expectedAnswer = expectedAnswers[0] || ''

  const canAcceptAnswers = baseContext.itemType === 'question' && supportedRound && expectedAnswers.length > 0

  let unsupportedReason = ''
  if (baseContext.itemType !== 'question') unsupportedReason = 'no-question'
  else if (!supportedRound) unsupportedReason = 'unsupported-round'
  else if (expectedAnswers.length === 0) unsupportedReason = 'missing-answer'

  return {
    ...baseContext,
    roundType,
    supportedRound,
    expectedAnswer,
    expectedAnswers,
    canAcceptAnswers,
    unsupportedReason,
  }
}

function normalizeWinner(rawWinner) {
  if (!rawWinner || typeof rawWinner !== 'object' || Array.isArray(rawWinner)) return null
  const teamIndex = Number.parseInt(rawWinner.teamIndex, 10)
  if (!Number.isInteger(teamIndex) || teamIndex < 0) return null
  const points = Number.parseInt(rawWinner.points, 10)
  const timestamp = Number.parseInt(rawWinner.timestamp, 10)
  return {
    teamIndex,
    memberName: normalizeText(rawWinner.memberName).slice(0, 80) || null,
    guess: normalizeText(rawWinner.guess).slice(0, 240) || null,
    answer: normalizeText(rawWinner.answer).slice(0, 240) || null,
    points: Number.isInteger(points) ? points : 0,
    questionId: normalizeQuestionId(rawWinner.questionId),
    timestamp: Number.isInteger(timestamp) && timestamp > 0 ? timestamp : Date.now(),
  }
}

function normalizeAttempt(rawAttempt) {
  if (!rawAttempt || typeof rawAttempt !== 'object' || Array.isArray(rawAttempt)) return null
  const teamIndex = Number.parseInt(rawAttempt.teamIndex, 10)
  if (!Number.isInteger(teamIndex) || teamIndex < 0) return null
  const timestamp = Number.parseInt(rawAttempt.timestamp, 10)
  return {
    teamIndex,
    memberName: normalizeText(rawAttempt.memberName).slice(0, 80) || null,
    guess: normalizeText(rawAttempt.guess).slice(0, 240),
    questionId: normalizeQuestionId(rawAttempt.questionId),
    timestamp: Number.isInteger(timestamp) && timestamp > 0 ? timestamp : Date.now(),
  }
}

export function buildInitialAnswerState({ questionId = null, open = false } = {}) {
  return {
    questionId: normalizeQuestionId(questionId),
    status: open ? 'open' : 'locked',
    winner: null,
    revealedAnswer: null,
    recentAttempts: [],
  }
}

export function normalizeAnswerState(rawState, fallbackQuestionId = null) {
  if (!rawState || typeof rawState !== 'object' || Array.isArray(rawState)) {
    return buildInitialAnswerState({ questionId: fallbackQuestionId, open: false })
  }

  const status = String(rawState.status || '').trim().toLowerCase() === 'open' ? 'open' : 'locked'
  const questionId = normalizeQuestionId(rawState.questionId) || normalizeQuestionId(fallbackQuestionId)
  const winner = normalizeWinner(rawState.winner)
  const revealedAnswer = normalizeText(rawState.revealedAnswer).slice(0, 240) || null
  const recentAttempts = Array.isArray(rawState.recentAttempts)
    ? rawState.recentAttempts.map((attempt) => normalizeAttempt(attempt)).filter(Boolean).slice(-MAX_ATTEMPTS_IN_STATE)
    : []

  return {
    questionId,
    status,
    winner,
    revealedAnswer,
    recentAttempts,
  }
}

export function serializeAnswerState(answerState, teams = []) {
  const normalized = normalizeAnswerState(answerState)
  const withTeam = (teamIndex) => {
    if (!Number.isInteger(teamIndex) || teamIndex < 0 || !teams[teamIndex]) return null
    return {
      name: String(teams[teamIndex].name || ''),
      color: String(teams[teamIndex].color || ''),
    }
  }

  return {
    questionId: normalized.questionId,
    status: normalized.status,
    open: normalized.status === 'open',
    winner: normalized.winner
      ? {
          ...normalized.winner,
          team: withTeam(normalized.winner.teamIndex),
        }
      : null,
    revealedAnswer: normalized.revealedAnswer,
    recentAttempts: normalized.recentAttempts.map((attempt) => ({
      ...attempt,
      team: withTeam(attempt.teamIndex),
    })),
  }
}

export function resetAnswerStateForCursor(st) {
  const context = resolveHostlessQuestionContext(st)
  st.answerState = buildInitialAnswerState({
    questionId: context.cursorId,
    open: Boolean(context.canAcceptAnswers),
  })
  return context
}

export function lockAnswerState(st, winnerPayload) {
  const winner = normalizeWinner(winnerPayload)
  if (!winner) return
  const normalized = normalizeAnswerState(st.answerState, winner.questionId)
  st.answerState = {
    ...normalized,
    status: 'locked',
    winner,
    revealedAnswer: winner.answer || normalized.revealedAnswer || null,
  }
}

export function recordWrongAttempt(st, attemptPayload) {
  const attempt = normalizeAttempt(attemptPayload)
  if (!attempt) return
  const normalized = normalizeAnswerState(st.answerState, attempt.questionId)
  const recentAttempts = [...normalized.recentAttempts, attempt].slice(-MAX_ATTEMPTS_IN_STATE)
  st.answerState = {
    ...normalized,
    recentAttempts,
  }
}

export function resolveHostlessPoints(round) {
  const scoring = round?.scoring
  if (scoring && typeof scoring === 'object' && !Array.isArray(scoring)) {
    const points = Number.parseInt(scoring.correctPoints, 10)
    return Number.isInteger(points) && points > 0 ? points : 3
  }
  return 3
}

function collapseWhitespace(value) {
  return normalizeText(value).replace(/\s+/g, ' ')
}

export function normalizeGuessForMatch(value) {
  return collapseWhitespace(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function levenshteinDistance(a, b, maxAllowed = Number.POSITIVE_INFINITY) {
  const lenA = a.length
  const lenB = b.length
  if (Math.abs(lenA - lenB) > maxAllowed) return maxAllowed + 1
  const prev = new Array(lenB + 1)
  const next = new Array(lenB + 1)

  for (let j = 0; j <= lenB; j += 1) prev[j] = j

  for (let i = 1; i <= lenA; i += 1) {
    next[0] = i
    let rowBest = next[0]
    const charA = a.charCodeAt(i - 1)
    for (let j = 1; j <= lenB; j += 1) {
      const cost = charA === b.charCodeAt(j - 1) ? 0 : 1
      const insertion = next[j - 1] + 1
      const deletion = prev[j] + 1
      const substitution = prev[j - 1] + cost
      const value = Math.min(insertion, deletion, substitution)
      next[j] = value
      if (value < rowBest) rowBest = value
    }
    if (rowBest > maxAllowed) return maxAllowed + 1
    for (let j = 0; j <= lenB; j += 1) prev[j] = next[j]
  }

  return prev[lenB]
}

function allowedEditDistance(expectedLength) {
  if (expectedLength <= 5) return 1
  if (expectedLength <= 12) return 2
  if (expectedLength <= 24) return 3
  return 4
}

function maybeSplitCandidateAnswers(expectedAnswer) {
  const normalized = collapseWhitespace(expectedAnswer)
  if (!normalized) return []
  const candidates = [normalized]

  if (normalized.includes(' / ')) {
    normalized.split(' / ').map((value) => collapseWhitespace(value)).filter(Boolean).forEach((value) => candidates.push(value))
  }
  if (normalized.includes(' or ')) {
    normalized.split(/\s+or\s+/i).map((value) => collapseWhitespace(value)).filter(Boolean).forEach((value) => candidates.push(value))
  }

  return [...new Set(candidates)]
}

function collectCandidateAnswers(expectedAnswer, expectedAnswers = []) {
  const candidates = []
  const seen = new Set()
  const queue = [expectedAnswer]
  if (Array.isArray(expectedAnswers)) queue.push(...expectedAnswers)

  for (const raw of queue) {
    const split = maybeSplitCandidateAnswers(raw)
    for (const candidate of split) {
      const key = normalizeGuessForMatch(candidate)
      if (!key || seen.has(key)) continue
      seen.add(key)
      candidates.push(candidate)
    }
  }
  return candidates
}

export function isGuessCorrect(guess, expectedAnswer, expectedAnswers = []) {
  const guessNorm = normalizeGuessForMatch(guess)
  if (!guessNorm) return false

  const candidates = collectCandidateAnswers(expectedAnswer, expectedAnswers)
  for (const candidate of candidates) {
    const expectedNorm = normalizeGuessForMatch(candidate)
    if (!expectedNorm) continue
    if (guessNorm === expectedNorm) return true

    const maxEdits = allowedEditDistance(expectedNorm.length)
    if (levenshteinDistance(guessNorm, expectedNorm, maxEdits) <= maxEdits) return true
  }

  return false
}
