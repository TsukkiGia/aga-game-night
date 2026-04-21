import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  clearQuestionLastFromReactionStats,
  normalizeReactionStats,
  updateReactionStatsWithAttempt,
} from '../core/reactionStats'
import { questionPreviewHeadline } from '../components/game-config/helpers'

export function useReactionStats({ activeItem, planDisplay, roundCatalog }) {
  const [reactionStats, setReactionStats] = useState({})
  const [showStats, setShowStats] = useState(false)
  const activeQuestionContextRef = useRef(null)

  useEffect(() => {
    if (!activeItem) { activeQuestionContextRef.current = null; return }
    const round = roundCatalog[activeItem.roundIndex]
    const question = round?.questions?.[activeItem.questionIndex]
    const roundNum = planDisplay.roundDisplayNumberByIndex.get(activeItem.roundIndex) ?? (activeItem.roundIndex + 1)
    const qNum = planDisplay.questionDisplayNumberByItemId.get(activeItem.id) ?? (activeItem.questionIndex + 1)
    activeQuestionContextRef.current = {
      label: `R${roundNum}Q${qNum}`,
      headline: questionPreviewHeadline(round, question, activeItem.questionIndex),
    }
  }, [activeItem, roundCatalog, planDisplay])

  const handleBuzzAttempt = useCallback((data) => {
    const ctx = activeQuestionContextRef.current
    setReactionStats((prev) => updateReactionStatsWithAttempt(prev, {
      ...data,
      questionLabel: ctx?.label ?? null,
      questionHeadline: ctx?.headline ?? null,
    }))
  }, [])

  const reactionRows = useMemo(() => {
    return Object.values(reactionStats).sort((a, b) => {
      const aHas = Number.isInteger(a.questionLastMs)
      const bHas = Number.isInteger(b.questionLastMs)
      if (aHas && bHas) {
        if (a.questionLastMs !== b.questionLastMs) return a.questionLastMs - b.questionLastMs
      } else if (aHas !== bHas) {
        return aHas ? -1 : 1
      }
      if (a.bestMs !== b.bestMs) return a.bestMs - b.bestMs
      return a.name.localeCompare(b.name)
    })
  }, [reactionStats])

  const questionRaceRows = useMemo(
    () => reactionRows.filter((row) => Number.isInteger(row.questionLastMs)),
    [reactionRows]
  )

  const clearQuestionLast = useCallback(() => {
    setReactionStats((prev) => clearQuestionLastFromReactionStats(prev))
  }, [])

  const hydrateStats = useCallback((serverStats) => {
    setReactionStats(normalizeReactionStats(serverStats))
  }, [])

  const resetStats = useCallback(() => {
    setReactionStats({})
  }, [])

  return {
    reactionStats,
    showStats,
    setShowStats,
    handleBuzzAttempt,
    reactionRows,
    questionRaceRows,
    clearQuestionLast,
    hydrateStats,
    resetStats,
  }
}
