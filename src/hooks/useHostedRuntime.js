import { useCallback } from 'react'

export function useHostedRuntime({
  hostlessModeActive = false,
  clearDoublePoints = () => {},
  resetBuzzState = () => {},
} = {}) {
  const dismissHostedBuzz = useCallback(() => {
    if (hostlessModeActive) return
    resetBuzzState()
  }, [hostlessModeActive, resetBuzzState])

  const dismissBuzzAndResetMultiplier = useCallback(() => {
    clearDoublePoints()
    dismissHostedBuzz()
  }, [clearDoublePoints, dismissHostedBuzz])

  const clearForCursorChange = useCallback((clearBuzz = true) => {
    if (!clearBuzz) return
    dismissBuzzAndResetMultiplier()
  }, [dismissBuzzAndResetMultiplier])

  const markDoneWithMultiplierReset = useCallback((questionId, markDone) => {
    clearDoublePoints()
    if (typeof markDone === 'function') markDone(questionId)
  }, [clearDoublePoints])

  return {
    dismissHostedBuzz,
    dismissBuzzAndResetMultiplier,
    clearForCursorChange,
    markDoneWithMultiplierReset,
  }
}
