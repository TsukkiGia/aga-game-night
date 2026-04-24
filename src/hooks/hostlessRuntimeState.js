export const INITIAL_HOSTLESS_RUNTIME_STATE = {
  attemptFeed: [],
  correctEvent: null,
  answerState: null,
  timeoutEvent: null,
  activeQuestionId: '',
  terminalQuestionId: '',
}

function normalizeQuestionId(value) {
  return String(value || '').trim()
}

function buildLockedAnswerState(prevAnswerState, {
  questionId = '',
  winner = null,
  revealedAnswer = null,
} = {}) {
  const fallbackQuestionId = normalizeQuestionId(prevAnswerState?.questionId)
  const normalizedQuestionId = normalizeQuestionId(questionId) || fallbackQuestionId
  const normalizedAnswer = String(revealedAnswer || '').trim() || null
  const recentAttempts = Array.isArray(prevAnswerState?.recentAttempts)
    ? prevAnswerState.recentAttempts
    : []
  return {
    questionId: normalizedQuestionId,
    status: 'locked',
    winner: winner && typeof winner === 'object' ? winner : null,
    revealedAnswer: normalizedAnswer,
    recentAttempts,
  }
}

export function hostlessRuntimeReducer(state, action) {
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
      const questionId = normalizeQuestionId(action.payload.questionId || state.answerState?.questionId)
      const winner = {
        teamIndex: Number.isInteger(Number.parseInt(action.payload.teamIndex, 10))
          ? Number.parseInt(action.payload.teamIndex, 10)
          : null,
        memberName: action.payload.memberName ? String(action.payload.memberName) : null,
        guess: action.payload.guess ? String(action.payload.guess) : null,
        answer: action.payload.answer ? String(action.payload.answer) : null,
        points: Number.isFinite(Number(action.payload.points)) ? Number(action.payload.points) : null,
        questionId,
        timestamp: Number.isFinite(Number(action.payload.timestamp)) ? Number(action.payload.timestamp) : null,
      }
      return {
        ...state,
        correctEvent: action.payload,
        timeoutEvent: null,
        terminalQuestionId: questionId || state.terminalQuestionId,
        answerState: buildLockedAnswerState(state.answerState, {
          questionId,
          winner,
          revealedAnswer: action.payload.answer,
        }),
      }
    }
    case 'ANSWER_TIMEOUT': {
      if (!action.payload || typeof action.payload !== 'object') return state
      const questionId = normalizeQuestionId(action.payload.questionId || state.answerState?.questionId)
      const revealedAnswer = String(action.payload.answer || '').trim()
      return {
        ...state,
        correctEvent: null,
        timeoutEvent: action.payload,
        terminalQuestionId: questionId || state.terminalQuestionId,
        answerState: buildLockedAnswerState(state.answerState, {
          questionId,
          winner: null,
          revealedAnswer,
        }),
      }
    }
    case 'ANSWER_STATE': {
      const payload = (action.payload && typeof action.payload === 'object') ? action.payload : null
      const payloadQuestionId = normalizeQuestionId(payload?.questionId)
      const payloadStatus = String(payload?.status || '').trim().toLowerCase()
      if (payload && payloadStatus === 'open' && payloadQuestionId && payloadQuestionId === state.terminalQuestionId) {
        return state
      }
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
          terminalQuestionId: payloadQuestionId || state.terminalQuestionId,
          timeoutEvent: matchesExistingTimeout
            ? nextState.timeoutEvent
            : { questionId: payload.questionId, answer: revealedAnswer },
        }
      }
      if (payload.status === 'locked') {
        return {
          ...nextState,
          terminalQuestionId: payloadQuestionId || state.terminalQuestionId,
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
        terminalQuestionId: '',
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
      return { ...INITIAL_HOSTLESS_RUNTIME_STATE }
    }
    default:
      return state
  }
}

