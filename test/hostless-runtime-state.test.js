import test from 'node:test'
import assert from 'node:assert/strict'
import { INITIAL_HOSTLESS_RUNTIME_STATE, hostlessRuntimeReducer } from '../src/hooks/hostlessRuntimeState.js'

function applyActions(actions) {
  return actions.reduce((state, action) => hostlessRuntimeReducer(state, action), { ...INITIAL_HOSTLESS_RUNTIME_STATE })
}

test('hostless runtime ignores late open state after timeout on same question', () => {
  const beforeLateOpen = applyActions([
    { type: 'ANSWER_STATE', payload: { questionId: 'q:round-1:q1', status: 'open', winner: null, revealedAnswer: null, recentAttempts: [] } },
    { type: 'ANSWER_TIMEOUT', payload: { questionId: 'q:round-1:q1', answer: 'Nouakchott' } },
  ])

  const afterLateOpen = hostlessRuntimeReducer(beforeLateOpen, {
    type: 'ANSWER_STATE',
    payload: { questionId: 'q:round-1:q1', status: 'open', winner: null, revealedAnswer: null, recentAttempts: [] },
  })

  assert.equal(afterLateOpen, beforeLateOpen, 'late open event for terminal question should be ignored')
  assert.equal(afterLateOpen.answerState?.status, 'locked')
  assert.equal(afterLateOpen.answerState?.questionId, 'q:round-1:q1')
  assert.equal(afterLateOpen.terminalQuestionId, 'q:round-1:q1')
})

test('hostless runtime allows sudden death open state on a new question id after timeout', () => {
  const afterTimeout = applyActions([
    { type: 'ANSWER_STATE', payload: { questionId: 'q:round-1:q1', status: 'open', winner: null, revealedAnswer: null, recentAttempts: [] } },
    { type: 'ANSWER_TIMEOUT', payload: { questionId: 'q:round-1:q1', answer: 'Nouakchott' } },
  ])

  const afterSuddenDeathOpen = hostlessRuntimeReducer(afterTimeout, {
    type: 'ANSWER_STATE',
    payload: { questionId: 'sd:1', status: 'open', winner: null, revealedAnswer: null, recentAttempts: [] },
  })

  assert.equal(afterSuddenDeathOpen.answerState?.status, 'open')
  assert.equal(afterSuddenDeathOpen.answerState?.questionId, 'sd:1')
  assert.equal(afterSuddenDeathOpen.timeoutEvent, null)
})

test('question boundary clears terminal lock for next question', () => {
  const afterTimeout = applyActions([
    { type: 'ANSWER_STATE', payload: { questionId: 'q:round-1:q1', status: 'open', winner: null, revealedAnswer: null, recentAttempts: [] } },
    { type: 'ANSWER_TIMEOUT', payload: { questionId: 'q:round-1:q1', answer: 'Nouakchott' } },
  ])

  const afterBoundary = hostlessRuntimeReducer(afterTimeout, {
    type: 'QUESTION_BOUNDARY',
    questionId: 'q:round-1:q2',
  })

  assert.equal(afterBoundary.terminalQuestionId, '')
  assert.equal(afterBoundary.activeQuestionId, 'q:round-1:q2')
  assert.equal(afterBoundary.timeoutEvent, null)
  assert.equal(afterBoundary.correctEvent, null)
})

