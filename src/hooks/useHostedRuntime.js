import { useCallback, useEffect, useReducer } from 'react'
import { playArm } from '../core/sounds'

const INITIAL_STATE = {
  stealMode: false,
  stealPending: false,
}

function hostedRuntimeReducer(state, action) {
  switch (action.type) {
    case 'ENTER_STEAL_PENDING':
      return { ...state, stealMode: true, stealPending: true }
    case 'STEAL_ARMED':
      if (!state.stealMode) return state
      return { ...state, stealPending: false }
    case 'CLEAR_STEAL':
      if (!state.stealMode && !state.stealPending) return state
      return { ...state, stealMode: false, stealPending: false }
    case 'RESET_ALL':
      return { ...INITIAL_STATE }
    default:
      return state
  }
}

function resolveAllowedTeamIndices(config) {
  if (Array.isArray(config)) return config
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    if (Array.isArray(config.allowedTeamIndices)) return config.allowedTeamIndices
  }
  return null
}

export function useHostedRuntime({
  hostlessModeActive = false,
  armed = false,
  buzzWinner = null,
  clearDoublePoints = () => {},
  armBuzzers = async () => ({ ok: false, error: 'arm-unavailable' }),
  resetBuzzers = async () => ({ ok: false, error: 'reset-unavailable' }),
  onArmSound = playArm,
} = {}) {
  const [state, dispatch] = useReducer(hostedRuntimeReducer, INITIAL_STATE)

  useEffect(() => {
    if (hostlessModeActive) {
      dispatch({ type: 'RESET_ALL' })
      return
    }
    if (!armed && !buzzWinner && !state.stealPending) dispatch({ type: 'CLEAR_STEAL' })
  }, [hostlessModeActive, armed, buzzWinner, state.stealPending])

  const handleArm = useCallback(async (options = {}) => {
    if (hostlessModeActive) return { ok: false, error: 'hostless-mode' }
    const result = await armBuzzers(options)
    if (result?.ok && typeof onArmSound === 'function') onArmSound()
    return result
  }, [hostlessModeActive, armBuzzers, onArmSound])

  const handleDismiss = useCallback(async () => {
    dispatch({ type: 'CLEAR_STEAL' })
    if (hostlessModeActive) return { ok: true, skipped: true }
    const result = await resetBuzzers()
    if (!result?.ok) return result
    dispatch({ type: 'CLEAR_STEAL' })
    return result
  }, [hostlessModeActive, resetBuzzers])

  const handleWrongAndSteal = useCallback(async (config = null) => {
    if (hostlessModeActive) return { ok: false, error: 'hostless-mode' }
    const allowedTeamIndices = resolveAllowedTeamIndices(config)

    const resetResult = await resetBuzzers()
    if (!resetResult?.ok) return resetResult

    dispatch({ type: 'ENTER_STEAL_PENDING' })
    const armOptions = {}
    if (allowedTeamIndices) armOptions.allowedTeamIndices = allowedTeamIndices
    const armResult = await armBuzzers(armOptions)
    if (armResult?.ok) {
      dispatch({ type: 'STEAL_ARMED' })
      if (typeof onArmSound === 'function') onArmSound()
      return armResult
    }
    dispatch({ type: 'CLEAR_STEAL' })
    return armResult
  }, [hostlessModeActive, resetBuzzers, armBuzzers, onArmSound])

  const handleRearm = useCallback(async (options = {}) => {
    dispatch({ type: 'CLEAR_STEAL' })
    if (hostlessModeActive) return { ok: false, error: 'hostless-mode' }

    const resetResult = await resetBuzzers()
    if (!resetResult?.ok) return resetResult

    const armResult = await armBuzzers(options)
    if (armResult?.ok && typeof onArmSound === 'function') onArmSound()
    return armResult
  }, [hostlessModeActive, resetBuzzers, armBuzzers, onArmSound])

  const dismissHostedBuzz = useCallback(() => {
    void handleDismiss()
  }, [handleDismiss])

  const dismissBuzzAndResetMultiplier = useCallback(() => {
    clearDoublePoints()
    void handleDismiss()
  }, [clearDoublePoints, handleDismiss])

  const clearForCursorChange = useCallback((clearBuzz = true) => {
    if (!clearBuzz) return
    dismissBuzzAndResetMultiplier()
  }, [dismissBuzzAndResetMultiplier])

  const markDoneWithMultiplierReset = useCallback((questionId, markDone) => {
    clearDoublePoints()
    if (typeof markDone === 'function') markDone(questionId)
  }, [clearDoublePoints])

  return {
    stealMode: state.stealMode,
    handleArm,
    handleDismiss,
    handleWrongAndSteal,
    handleRearm,
    dismissHostedBuzz,
    dismissBuzzAndResetMultiplier,
    clearForCursorChange,
    markDoneWithMultiplierReset,
  }
}
