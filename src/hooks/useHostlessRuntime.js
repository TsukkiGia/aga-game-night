import { useCallback, useReducer, useRef } from 'react'

const INITIAL_STATE = {
  attemptFeed: [],
  correctEvent: null,
  answerState: null,
  timeoutEvent: null,
  activeQuestionId: '',
}

function hostlessRuntimeReducer(state, action) {
  switch (action.type) {
    case 'ANSWER_ATTEMPT': {
      if (!action.payload || typeof action.payload !== 'object') return state
      return {
        ...state,
        attemptFeed: [...state.attemptFeed, action.payload].slice(-8),
      }
    }
    case 'ANSWER_CORRECT': {
      if (!action.payload || typeof action.payload !== 'object') return state
      return {
        ...state,
        correctEvent: action.payload,
        timeoutEvent: null,
      }
    }
    case 'ANSWER_TIMEOUT': {
      if (!action.payload || typeof action.payload !== 'object') return state
      return {
        ...state,
        correctEvent: null,
        timeoutEvent: action.payload,
      }
    }
    case 'ANSWER_STATE': {
      const payload = (action.payload && typeof action.payload === 'object') ? action.payload : null
      const nextState = {
        ...state,
        answerState: payload,
      }
      if (!payload) return nextState
      if (payload.status === 'open') {
        return {
          ...nextState,
          timeoutEvent: null,
        }
      }
      const revealedAnswer = String(payload.revealedAnswer || '').trim()
      if (payload.status === 'locked' && !payload.winner && revealedAnswer) {
        const matchesExistingTimeout = (
          nextState.timeoutEvent?.questionId === payload.questionId
          && String(nextState.timeoutEvent?.answer || '').trim() === revealedAnswer
        )
        return {
          ...nextState,
          correctEvent: null,
          timeoutEvent: matchesExistingTimeout
            ? nextState.timeoutEvent
            : { questionId: payload.questionId, answer: revealedAnswer },
        }
      }
      return nextState
    }
    case 'QUESTION_BOUNDARY': {
      const questionId = String(action.questionId || '').trim()
      if (!questionId || questionId === state.activeQuestionId) return state
      return {
        ...state,
        activeQuestionId: questionId,
        attemptFeed: [],
        correctEvent: null,
        timeoutEvent: null,
      }
    }
    case 'CLEAR_TRANSIENT': {
      return {
        ...state,
        attemptFeed: [],
        correctEvent: null,
        timeoutEvent: null,
      }
    }
    case 'DISMISS_CORRECT': {
      return {
        ...state,
        correctEvent: null,
      }
    }
    case 'DISMISS_TIMEOUT': {
      return {
        ...state,
        timeoutEvent: null,
      }
    }
    case 'RESET_ALL': {
      return { ...INITIAL_STATE }
    }
    default:
      return state
  }
}

function buildCorrectSoundKey(payload) {
  return [
    String(payload?.questionId || ''),
    String(payload?.teamIndex ?? ''),
    String(payload?.timestamp ?? ''),
  ].join('|')
}

export function useHostlessRuntime({ onCorrectSound = null } = {}) {
  const lastCorrectSoundKeyRef = useRef('')
  const [state, dispatch] = useReducer(hostlessRuntimeReducer, INITIAL_STATE)

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
