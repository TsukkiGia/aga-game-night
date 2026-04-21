import { useCallback, useMemo } from 'react'
import {
  normalizePlanIdsWithRoundIntros,
  normalizeCursorId,
  questionItemIdFor,
} from '../core/gamePlan'

export function useGamePlan({ gamePlanIds, planCatalog, roundCatalog, activeQuestion, transition }) {
  const normalizedPlanIds = useMemo(
    () => normalizePlanIdsWithRoundIntros(gamePlanIds, planCatalog, { fallbackToDefault: true }),
    [gamePlanIds, planCatalog]
  )
  const planIdSet = useMemo(() => new Set(normalizedPlanIds), [normalizedPlanIds])
  const plannedItems = useMemo(
    () => normalizedPlanIds.map((id) => planCatalog.byId.get(id)).filter(Boolean),
    [normalizedPlanIds, planCatalog]
  )
  const activeQuestionId = useMemo(
    () => normalizeCursorId(activeQuestion, normalizedPlanIds, planCatalog),
    [activeQuestion, normalizedPlanIds, planCatalog]
  )
  const activeItem = useMemo(
    () => (activeQuestionId ? planCatalog.byId.get(activeQuestionId) || null : null),
    [activeQuestionId, planCatalog]
  )
  const activePlanIndex = useMemo(
    () => (activeQuestionId ? normalizedPlanIds.indexOf(activeQuestionId) : -1),
    [activeQuestionId, normalizedPlanIds]
  )
  const activeLegacyPair = useMemo(
    () => (activeItem ? [activeItem.roundIndex, activeItem.questionIndex] : null),
    [activeItem]
  )
  const plannedRoundIndexSet = useMemo(() => {
    const set = new Set()
    plannedItems.forEach((item) => set.add(item.roundIndex))
    return set
  }, [plannedItems])
  const hasPlannedQuestions = plannedItems.some((item) => item.type === 'question')
  const planDisplay = useMemo(() => {
    const roundDisplayNumberByIndex = new Map()
    const questionDisplayNumberByItemId = new Map()
    const questionTotalByRound = new Map()
    let roundCounter = 0
    for (const item of plannedItems) {
      if (!roundDisplayNumberByIndex.has(item.roundIndex)) {
        roundCounter += 1
        roundDisplayNumberByIndex.set(item.roundIndex, roundCounter)
      }
      if (item.type !== 'question') continue
      const nextNumber = (questionTotalByRound.get(item.roundIndex) || 0) + 1
      questionTotalByRound.set(item.roundIndex, nextNumber)
      questionDisplayNumberByItemId.set(item.id, nextNumber)
    }
    return { roundDisplayNumberByIndex, questionDisplayNumberByItemId, questionTotalByRound }
  }, [plannedItems])
  const getRoundDisplayLabel = useCallback((roundIndex) => {
    const displayNumber = planDisplay.roundDisplayNumberByIndex.get(roundIndex) || (roundIndex + 1)
    return `Round ${displayNumber}`
  }, [planDisplay])
  const getQuestionDisplayNumber = useCallback((roundIndex, questionIndex) => {
    const id = questionItemIdFor(roundIndex, questionIndex, planCatalog)
    if (!id) return questionIndex + 1
    return planDisplay.questionDisplayNumberByItemId.get(id) || (questionIndex + 1)
  }, [planDisplay, planCatalog])
  const getQuestionTotal = useCallback((roundIndex) => {
    return planDisplay.questionTotalByRound.get(roundIndex) || (roundCatalog[roundIndex]?.questions?.length || 0)
  }, [planDisplay, roundCatalog])
  const transitionRoundLabel = useMemo(() => {
    if (!transition) return null
    const idx = roundCatalog.findIndex((round) => round?.id === transition?.id)
    if (idx < 0) return transition.label
    return getRoundDisplayLabel(idx)
  }, [transition, getRoundDisplayLabel, roundCatalog])

  return {
    normalizedPlanIds,
    planIdSet,
    plannedItems,
    activeQuestionId,
    activeItem,
    activePlanIndex,
    activeLegacyPair,
    plannedRoundIndexSet,
    hasPlannedQuestions,
    planDisplay,
    getRoundDisplayLabel,
    getQuestionDisplayNumber,
    getQuestionTotal,
    transitionRoundLabel,
  }
}
