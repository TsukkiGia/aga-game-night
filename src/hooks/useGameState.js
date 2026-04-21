import { useState, useEffect, useMemo } from 'react'
import { SCORES_KEY, DONE_KEY, loadScores, loadDone, clearAll, setStorageItem } from '../core/storage'
import { playCorrect, playWrong } from '../core/sounds'
import rounds from '../core/rounds'
import { buildPlanCatalog, normalizeDoneQuestionIds, questionItemIdFor } from '../core/gamePlan'
import { normalizeRoundCatalog } from '../core/roundCatalog'

const STREAK_THRESHOLD = 3
const DEFAULT_ROUND_CATALOG = normalizeRoundCatalog(rounds)

export function useGameState(initialTeams, options = {}) {
  const onStreak = typeof options.onStreak === 'function' ? options.onStreak : null
  const effectiveRoundCatalog = useMemo(() => {
    const normalized = normalizeRoundCatalog(options.roundCatalog)
    return normalized.length > 0 ? normalized : DEFAULT_ROUND_CATALOG
  }, [options.roundCatalog])
  const planCatalog = useMemo(() => buildPlanCatalog(effectiveRoundCatalog), [effectiveRoundCatalog])

  function resolveDoneQuestionId(valueOrRoundIndex, maybeQuestionIndex) {
    if (Number.isInteger(valueOrRoundIndex) && Number.isInteger(maybeQuestionIndex)) {
      return questionItemIdFor(valueOrRoundIndex, maybeQuestionIndex, planCatalog)
    }
    const candidate = String(valueOrRoundIndex || '').trim()
    if (!candidate) return null
    if (planCatalog.byId.get(candidate)?.type === 'question') return candidate
    return null
  }

  const [teams, setTeams] = useState(() => loadScores(initialTeams))
  const [doneQuestionsRaw, setDoneQuestionsRaw] = useState(() => {
    const saved = loadDone()
    return new Set([...saved])
  })
  const doneQuestions = useMemo(
    () => new Set(normalizeDoneQuestionIds([...doneQuestionsRaw], planCatalog)),
    [doneQuestionsRaw, planCatalog]
  )
  const [flashing, setFlashing] = useState(null)
  const [doublePoints, setDoublePoints] = useState(false)
  const [streaks, setStreaks] = useState(() => initialTeams.map(() => 0))

  function hydrateFromServer(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return
    if (Array.isArray(snapshot.teams) && snapshot.teams.length === initialTeams.length) {
      setTeams(snapshot.teams.map((team, index) => {
        const fallback = initialTeams[index] || {}
        const scoreNum = Number(team?.score)
        const score = Number.isFinite(scoreNum) ? scoreNum : Number(fallback.score) || 0
        return {
          name: String(team?.name || fallback.name || `Team ${index + 1}`),
          color: String(team?.color || fallback.color || ''),
          score,
        }
      }))
    }
    if (Array.isArray(snapshot.doneQuestions)) {
      const nextDone = snapshot.doneQuestions
        .map((value) => String(value || '').trim())
        .filter(Boolean)
      setDoneQuestionsRaw(new Set(nextDone))
    }
    if (Array.isArray(snapshot.streaks)) {
      const nextStreaks = initialTeams.map((_, index) => {
        const parsed = Number.parseInt(snapshot.streaks[index], 10)
        return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
      })
      setStreaks(nextStreaks)
    }
    if (typeof snapshot.doublePoints === 'boolean') {
      setDoublePoints(snapshot.doublePoints)
    }
  }

  function clearDoublePoints() {
    setDoublePoints(false)
  }

  useEffect(() => {
    const s = {}
    teams.forEach((t, i) => { s[i] = t.score })
    setStorageItem(SCORES_KEY, JSON.stringify(s))
  }, [teams])

  useEffect(() => {
    setStorageItem(DONE_KEY, JSON.stringify([...doneQuestions]))
  }, [doneQuestions])

  function adjust(index, delta) {
    const effective = doublePoints ? delta * 2 : delta
    setTeams(prev => prev.map((t, i) => i === index ? { ...t, score: t.score + effective } : t))
    setFlashing(`${index}-${effective > 0 ? 'up' : 'down'}`)
    setTimeout(() => setFlashing(null), 400)
    if (effective > 0) {
      playCorrect()
      setStreaks(prev => {
        const next = prev.map((s, i) => i === index ? s + 1 : 0)
        const nextStreak = next[index] ?? 0
        if (onStreak && nextStreak === STREAK_THRESHOLD) {
          onStreak({ teamIndex: index, streakCount: nextStreak })
        }
        return next
      })
    } else {
      playWrong()
      setStreaks(prev => prev.map((s, i) => i === index ? 0 : s))
    }
  }

  function resetScores() {
    clearAll()
    setTeams(prev => prev.map(t => ({ ...t, score: 0 })))
    setDoneQuestionsRaw(new Set())
    clearDoublePoints()
  }

  function resetForNewGame() {
    setTeams(prev => prev.map(t => ({ ...t, score: 0 })))
    setDoneQuestionsRaw(new Set())
    setStreaks(initialTeams.map(() => 0))
    clearDoublePoints()
  }

  function toggleDone(valueOrRoundIndex, maybeQuestionIndex = null) {
    const key = resolveDoneQuestionId(valueOrRoundIndex, maybeQuestionIndex)
    if (!key) return
    setDoneQuestionsRaw(prevRaw => {
      const next = new Set(normalizeDoneQuestionIds([...prevRaw], planCatalog))
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  function markDone(valueOrRoundIndex, maybeQuestionIndex = null) {
    const key = resolveDoneQuestionId(valueOrRoundIndex, maybeQuestionIndex)
    if (!key) return
    setDoneQuestionsRaw(prevRaw => {
      const next = new Set(normalizeDoneQuestionIds([...prevRaw], planCatalog))
      next.add(key)
      return next
    })
  }

  return {
    teams,
    streaks,
    doneQuestions,
    flashing,
    doublePoints,
    setDoublePoints,
    clearDoublePoints,
    adjust,
    resetScores,
    resetForNewGame,
    toggleDone,
    markDone,
    hydrateFromServer,
  }
}
