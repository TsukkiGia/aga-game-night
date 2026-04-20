import { useEffect } from 'react'
import { socket } from '../socket'
import { normalizeReactionStats } from '../reactionStats'

const TIMEOUT_MS    = 3000
const RETRY_BASE_MS = 600
const RETRY_MAX_MS  = 5000

export function useRuntimePersist({
  hostReady,
  runtimeHydratedRef,
  teams,
  gameplayMode,
  doneQuestions,
  streaks,
  doublePoints,
  normalizedPlanIds,
  roundCatalog,
  reactionStats,
  invalidateAuth,
}) {
  useEffect(() => {
    if (!hostReady || !runtimeHydratedRef.current) return

    const payload = {
      teams: teams.map((team) => ({
        name: String(team.name || '').trim(),
        color: String(team.color || '').trim(),
        score: Number.isFinite(Number(team.score)) ? Number(team.score) : 0,
      })),
      doneQuestions: [...doneQuestions],
      gameplayMode,
      streaks: [...streaks],
      doublePoints: Boolean(doublePoints),
      gamePlan: normalizedPlanIds,
      roundCatalog,
      reactionStats: normalizeReactionStats(reactionStats),
    }

    let cancelled = false
    let retryCount = 0
    let retryTimer = null

    function scheduleRetry() {
      if (cancelled) return
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.min(retryCount, 4)))
      retryCount += 1
      retryTimer = setTimeout(send, delay)
    }

    function send() {
      if (cancelled) return
      socket.timeout(TIMEOUT_MS).emit('host:runtime:update', payload, (err, result) => {
        if (cancelled) return
        if (!err && result?.ok) return
        if (result?.error === 'unauthorized') {
          invalidateAuth('Host authorization expired while saving game state. Sign in again.')
          return
        }
        scheduleRetry()
      })
    }

    send()
    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [hostReady, teams, gameplayMode, doneQuestions, streaks, doublePoints, normalizedPlanIds, roundCatalog, reactionStats, invalidateAuth]) // eslint-disable-line react-hooks/exhaustive-deps
}
