import test from 'node:test'
import assert from 'node:assert/strict'
import { getRevealOutcome } from '../src/utils/buzzReveal.js'

test('funny bonus does not reveal answer outside steal mode', () => {
  const outcome = getRevealOutcome({
    roundType: 'slang',
    label: 'Funny bonus',
    points: 1,
    stealMode: false,
  })
  assert.deepEqual(outcome, { revealAnswer: false, revealCountry: false })
})

test('any steal scoring action reveals answer', () => {
  const revealOnCorrectSteal = getRevealOutcome({
    roundType: 'video',
    label: 'Correct steal',
    points: 2,
    stealMode: true,
  })
  const revealOnWrongSteal = getRevealOutcome({
    roundType: 'video',
    label: 'Wrong steal',
    points: 0,
    stealMode: true,
  })
  assert.deepEqual(revealOnCorrectSteal, { revealAnswer: true, revealCountry: false })
  assert.deepEqual(revealOnWrongSteal, { revealAnswer: true, revealCountry: false })
})

test('video correct country reveals country list only', () => {
  const outcome = getRevealOutcome({
    roundType: 'video',
    label: 'Correct country',
    points: 1,
    stealMode: false,
  })
  assert.deepEqual(outcome, { revealAnswer: false, revealCountry: true })
})

