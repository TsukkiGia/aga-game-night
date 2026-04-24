import { useCallback, useEffect, useReducer } from 'react'
import { socket } from '../core/socket'
import { playArm, playBuzzIn } from '../core/sounds'
import { syncHostSessionVersionFromAck, withHostCommandMeta } from '../core/hostCommandMeta'

const INITIAL_STATE = {
  armed: false,
  buzzWinner: null,
  stealMode: false,
  stealPending: false,
}

function hostedRuntimeReducer(state, action) {
  switch (action.type) {
    case 'SOCKET_SYNC': {
      const nextArmed = Boolean(action.payload?.armed)
      const rawWinner = action.payload?.buzzWinner
      const nextBuzzWinner = (
        rawWinner
        && typeof rawWinner.teamIndex === 'number'
        && rawWinner.team
        && typeof rawWinner.team === 'object'
      )
        ? rawWinner
        : null
      const shouldClearSteal = !nextArmed && !nextBuzzWinner && !state.stealPending
      return {
        ...state,
        armed: nextArmed,
        buzzWinner: nextBuzzWinner,
        ...(shouldClearSteal ? { stealMode: false } : {}),
      }
    }
    case 'BUZZ_ARMED':
      return { ...state, armed: true, buzzWinner: null }
    case 'BUZZ_RESET':
      return { ...state, armed: false, buzzWinner: null, stealMode: false, stealPending: false }
    case 'BUZZ_WINNER':
      return { ...state, armed: false, buzzWinner: action.payload || null, stealPending: false }
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
  clearDoublePoints = () => {},
  onArmSound = playArm,
} = {}) {
  const [state, dispatch] = useReducer(hostedRuntimeReducer, INITIAL_STATE)

  useEffect(() => {
    if (hostlessModeActive) {
      dispatch({ type: 'RESET_ALL' })
    }
  }, [hostlessModeActive])

  const emitArm = useCallback((options = {}) => {
    const safeOptions = {}
    if (options && typeof options === 'object' && !Array.isArray(options)) {
      if (Array.isArray(options.allowedTeamIndices)) safeOptions.allowedTeamIndices = options.allowedTeamIndices
    }
    const payload = withHostCommandMeta(safeOptions)
    return new Promise((resolve) => {
      socket.emit('host:arm', payload, (result) => {
        syncHostSessionVersionFromAck(result)
        resolve(result || { ok: false, error: 'server-error' })
      })
    })
  }, [])

  const emitReset = useCallback(() => {
    const payload = withHostCommandMeta()
    return new Promise((resolve) => {
      socket.emit('host:reset', payload, (result) => {
        syncHostSessionVersionFromAck(result)
        resolve(result || { ok: false, error: 'server-error' })
      })
    })
  }, [])

  const handleArm = useCallback(async (options = {}) => {
    if (hostlessModeActive) return { ok: false, error: 'hostless-mode' }
    const result = await emitArm(options)
    if (result?.ok) {
      dispatch({ type: 'BUZZ_ARMED' })
      if (typeof onArmSound === 'function') onArmSound()
    }
    return result
  }, [hostlessModeActive, emitArm, onArmSound])

  const handleDismiss = useCallback(async () => {
    dispatch({ type: 'CLEAR_STEAL' })
    if (hostlessModeActive) return { ok: true, skipped: true }
    const result = await emitReset()
    if (!result?.ok) return result
    dispatch({ type: 'BUZZ_RESET' })
    return result
  }, [hostlessModeActive, emitReset])

  const handleWrongAndSteal = useCallback(async (config = null) => {
    if (hostlessModeActive) return { ok: false, error: 'hostless-mode' }
    const allowedTeamIndices = resolveAllowedTeamIndices(config)

    const resetResult = await emitReset()
    if (!resetResult?.ok) return resetResult

    dispatch({ type: 'BUZZ_RESET' })
    dispatch({ type: 'ENTER_STEAL_PENDING' })
    const armOptions = {}
    if (allowedTeamIndices) armOptions.allowedTeamIndices = allowedTeamIndices
    const armResult = await emitArm(armOptions)
    if (armResult?.ok) {
      dispatch({ type: 'STEAL_ARMED' })
      dispatch({ type: 'BUZZ_ARMED' })
      if (typeof onArmSound === 'function') onArmSound()
      return armResult
    }
    dispatch({ type: 'CLEAR_STEAL' })
    return armResult
  }, [hostlessModeActive, emitReset, emitArm, onArmSound])

  const handleRearm = useCallback(async (options = {}) => {
    dispatch({ type: 'CLEAR_STEAL' })
    if (hostlessModeActive) return { ok: false, error: 'hostless-mode' }

    const resetResult = await emitReset()
    if (!resetResult?.ok) return resetResult

    dispatch({ type: 'BUZZ_RESET' })
    const armResult = await emitArm(options)
    if (armResult?.ok) {
      dispatch({ type: 'BUZZ_ARMED' })
      if (typeof onArmSound === 'function') onArmSound()
    }
    return armResult
  }, [hostlessModeActive, emitReset, emitArm, onArmSound])

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

  const onSocketStateSync = useCallback((statePayload) => {
    const buzzWinner = statePayload?.buzzedBy === null
      ? null
      : {
          teamIndex: statePayload?.buzzedBy,
          team: statePayload?.teams?.[statePayload?.buzzedBy],
          memberName: statePayload?.buzzedMemberName,
        }
    dispatch({
      type: 'SOCKET_SYNC',
      payload: {
        armed: Boolean(statePayload?.armed),
        buzzWinner,
      },
    })
  }, [])

  const onSocketBuzzArmed = useCallback(() => {
    dispatch({ type: 'BUZZ_ARMED' })
  }, [])

  const onSocketBuzzReset = useCallback(() => {
    dispatch({ type: 'BUZZ_RESET' })
  }, [])

  const onSocketBuzzWinner = useCallback((data) => {
    if (!data || typeof data.teamIndex !== 'number' || !data.team?.name || !data.team?.color) return
    dispatch({ type: 'BUZZ_WINNER', payload: data })
    playBuzzIn()
  }, [])

  return {
    armed: state.armed,
    buzzWinner: state.buzzWinner,
    stealMode: state.stealMode,
    handleArm,
    handleDismiss,
    handleWrongAndSteal,
    handleRearm,
    dismissHostedBuzz,
    dismissBuzzAndResetMultiplier,
    clearForCursorChange,
    markDoneWithMultiplierReset,
    onSocketStateSync,
    onSocketBuzzArmed,
    onSocketBuzzReset,
    onSocketBuzzWinner,
  }
}
