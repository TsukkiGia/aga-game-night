import { useCallback, useReducer, useRef } from 'react'
import { INITIAL_HOSTLESS_RUNTIME_STATE, hostlessRuntimeReducer } from './hostlessRuntimeState'

function buildCorrectSoundKey(payload) {
  return [
    String(payload?.questionId || ''),
    String(payload?.teamIndex ?? ''),
    String(payload?.timestamp ?? ''),
  ].join('|')
}

export function useHostlessRuntime({ onCorrectSound = null } = {}) {
  const lastCorrectSoundKeyRef = useRef('')
  const [state, dispatch] = useReducer(hostlessRuntimeReducer, INITIAL_HOSTLESS_RUNTIME_STATE)

  const ingestHostlessAnswerAttempt = useCallback((payload) => {
    dispatch({ type: 'ANSWER_ATTEMPT', payload })
  }, [])

  const ingestHostlessAnswerCorrect = useCallback((payload) => {
    const soundKey = buildCorrectSoundKey(payload)
    if (soundKey && soundKey !== lastCorrectSoundKeyRef.current) {
      lastCorrectSoundKeyRef.current = soundKey
      if (typeof onCorrectSound === 'function') onCorrectSound(payload)
    }
    dispatch({ type: 'ANSWER_CORRECT', payload })
  }, [onCorrectSound])

  const ingestHostlessAnswerTimeout = useCallback((payload) => {
    dispatch({ type: 'ANSWER_TIMEOUT', payload })
  }, [])

  const ingestHostlessAnswerState = useCallback((payload) => {
    dispatch({ type: 'ANSWER_STATE', payload })
  }, [])

  const clearHostlessTransient = useCallback(() => {
    dispatch({ type: 'CLEAR_TRANSIENT' })
  }, [])

  const resetHostlessRuntime = useCallback(() => {
    lastCorrectSoundKeyRef.current = ''
    dispatch({ type: 'RESET_ALL' })
  }, [])

  const syncHostlessQuestionBoundary = useCallback((questionId) => {
    dispatch({ type: 'QUESTION_BOUNDARY', questionId })
  }, [])

  const dismissHostlessCorrect = useCallback(() => {
    dispatch({ type: 'DISMISS_CORRECT' })
  }, [])

  const dismissHostlessTimeout = useCallback(() => {
    dispatch({ type: 'DISMISS_TIMEOUT' })
  }, [])

  return {
    hostlessAttemptFeed: state.attemptFeed,
    hostlessCorrectEvent: state.correctEvent,
    hostlessAnswerState: state.answerState,
    hostlessTimeoutEvent: state.timeoutEvent,
    ingestHostlessAnswerAttempt,
    ingestHostlessAnswerCorrect,
    ingestHostlessAnswerTimeout,
    ingestHostlessAnswerState,
    clearHostlessTransient,
    resetHostlessRuntime,
    syncHostlessQuestionBoundary,
    dismissHostlessCorrect,
    dismissHostlessTimeout,
  }
}
