import rounds from './rounds.js'

function roundStableId(round, roundIndex) {
  const raw = String(round?.id || '').trim()
  return raw || `round-${roundIndex + 1}`
}

function questionStableId(question, roundId, questionIndex) {
  const raw = String(question?.id || '').trim()
  return raw || `${roundId}-q${questionIndex + 1}`
}

function questionItemId(roundId, questionId) {
  return `q:${roundId}:${questionId}`
}

function introItemId(roundId) {
  return `intro:${roundId}`
}

export function buildPlanCatalog(roundList = rounds) {
  const items = []
  const byId = new Map()
  const introIdByRoundIndex = new Map()
  const questionIdByRoundQuestion = new Map()
  const questionIdsByRoundIndex = new Map()

  roundList.forEach((round, roundIndex) => {
    const roundId = roundStableId(round, roundIndex)
    const introId = introItemId(roundId)
    const introItem = {
      id: introId,
      type: 'round-intro',
      roundId,
      roundIndex,
      questionId: null,
      questionIndex: null,
    }
    items.push(introItem)
    byId.set(introId, introItem)
    introIdByRoundIndex.set(roundIndex, introId)

    const questionIds = []
    round.questions.forEach((question, questionIndex) => {
      const stableQuestionId = questionStableId(question, roundId, questionIndex)
      const id = questionItemId(roundId, stableQuestionId)
      const item = {
        id,
        type: 'question',
        roundId,
        roundIndex,
        questionId: stableQuestionId,
        questionIndex,
      }
      items.push(item)
      byId.set(id, item)
      questionIds.push(id)
      questionIdByRoundQuestion.set(`${roundIndex}-${questionIndex}`, id)
    })
    questionIdsByRoundIndex.set(roundIndex, questionIds)
  })

  return {
    items,
    byId,
    introIdByRoundIndex,
    questionIdByRoundQuestion,
    questionIdsByRoundIndex,
  }
}

const DEFAULT_CATALOG = buildPlanCatalog(rounds)

export function defaultPlanIds(catalog = DEFAULT_CATALOG) {
  return catalog.items.map((item) => item.id)
}

export function normalizePlanIds(rawPlan, catalog = DEFAULT_CATALOG, options = {}) {
  const fallbackToDefault = options?.fallbackToDefault !== false
  const normalized = []
  const seen = new Set()

  if (Array.isArray(rawPlan)) {
    for (const value of rawPlan) {
      const id = String(value || '').trim()
      if (!id || !catalog.byId.has(id) || seen.has(id)) continue
      seen.add(id)
      normalized.push(id)
    }
  }

  if (normalized.length > 0) return normalized
  if (!fallbackToDefault) return []
  return defaultPlanIds(catalog)
}

export function normalizePlanIdsWithRoundIntros(rawPlan, catalog = DEFAULT_CATALOG, options = {}) {
  const fallbackToDefault = options?.fallbackToDefault !== false
  const base = normalizePlanIds(rawPlan, catalog, { fallbackToDefault: false })
  if (base.length === 0) return fallbackToDefault ? defaultPlanIds(catalog) : []

  const out = []
  const seen = new Set()
  const introInserted = new Set()
  for (const id of base) {
    const item = catalog.byId.get(id)
    if (!item) continue
    if (item.type === 'question' && !introInserted.has(item.roundIndex)) {
      const introId = catalog.introIdByRoundIndex.get(item.roundIndex)
      if (introId && !seen.has(introId)) {
        seen.add(introId)
        out.push(introId)
      }
      introInserted.add(item.roundIndex)
    }
    if (item.type === 'round-intro') introInserted.add(item.roundIndex)
    if (!seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
  }
  return out.length > 0 ? out : (fallbackToDefault ? defaultPlanIds(catalog) : [])
}

export function legacyPairToItemId(cursorPair, catalog = DEFAULT_CATALOG) {
  if (!Array.isArray(cursorPair) || cursorPair.length !== 2) return null
  const [roundIndex, questionIndex] = cursorPair
  if (!Number.isInteger(roundIndex) || roundIndex < 0) return null
  if (questionIndex === null) return catalog.introIdByRoundIndex.get(roundIndex) || null
  if (!Number.isInteger(questionIndex) || questionIndex < 0) return null
  return catalog.questionIdByRoundQuestion.get(`${roundIndex}-${questionIndex}`) || null
}

export function normalizeCursorId(rawCursor, planIds, catalog = DEFAULT_CATALOG) {
  const planSet = new Set(Array.isArray(planIds) ? planIds : [])
  if (rawCursor === null || rawCursor === undefined) return null
  if (typeof rawCursor === 'string') {
    const id = rawCursor.trim()
    if (!id) return null
    return planSet.size === 0 || planSet.has(id) ? id : null
  }
  const fromLegacyPair = legacyPairToItemId(rawCursor, catalog)
  if (!fromLegacyPair) return null
  return planSet.size === 0 || planSet.has(fromLegacyPair) ? fromLegacyPair : null
}

export function normalizeDoneQuestionIds(rawDoneQuestions, catalog = DEFAULT_CATALOG) {
  if (!Array.isArray(rawDoneQuestions)) return []
  const out = []
  const seen = new Set()
  for (const value of rawDoneQuestions) {
    const asId = String(value || '').trim()
    if (asId && catalog.byId.has(asId) && catalog.byId.get(asId)?.type === 'question') {
      if (!seen.has(asId)) {
        seen.add(asId)
        out.push(asId)
      }
      continue
    }
    const match = asId.match(/^(\d+)-(\d+)$/)
    if (!match) continue
    const roundIndex = Number.parseInt(match[1], 10)
    const questionIndex = Number.parseInt(match[2], 10)
    if (!Number.isInteger(roundIndex) || !Number.isInteger(questionIndex)) continue
    const mapped = legacyPairToItemId([roundIndex, questionIndex], catalog)
    if (!mapped) continue
    if (catalog.byId.get(mapped)?.type !== 'question') continue
    if (seen.has(mapped)) continue
    seen.add(mapped)
    out.push(mapped)
  }
  return out
}

export function resolveEffectivePlanForSync(rawServerPlan, localPlanIds, catalog = DEFAULT_CATALOG) {
  const hasServerPlan = Array.isArray(rawServerPlan) && rawServerPlan.length > 0
  const normalizedServerPlan = normalizePlanIdsWithRoundIntros(rawServerPlan, catalog, { fallbackToDefault: true })
  if (hasServerPlan) return normalizedServerPlan
  return normalizePlanIdsWithRoundIntros(localPlanIds, catalog, { fallbackToDefault: true })
}

export function questionItemIdFor(roundIndex, questionIndex, catalog = DEFAULT_CATALOG) {
  return catalog.questionIdByRoundQuestion.get(`${roundIndex}-${questionIndex}`) || null
}

export function firstQuestionIdInRound(roundIndex, planIds, catalog = DEFAULT_CATALOG) {
  const ids = catalog.questionIdsByRoundIndex.get(roundIndex) || []
  const planSet = new Set(Array.isArray(planIds) ? planIds : [])
  for (const id of ids) {
    if (planSet.has(id)) return id
  }
  return null
}
