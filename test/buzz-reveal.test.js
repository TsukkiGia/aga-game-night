import test from 'node:test'
import assert from 'node:assert/strict'
import { getRevealOutcome } from '../src/utils/buzzReveal.js'

test('funny bonus does not reveal answer', () => {
  const outcome = getRevealOutcome({
    roundType: 'slang',
    entryKind: 'bonus',
    bonus: { label: 'Funny bonus', points: 1, noReveal: true },
  })
  assert.deepEqual(outcome, { revealAnswer: false, revealCountry: false })
})

test('any steal scoring action reveals answer', () => {
  const revealOnCorrectSteal = getRevealOutcome({ roundType: 'video', entryKind: 'correct-steal' })
  const revealOnWrongSteal = getRevealOutcome({ roundType: 'video', entryKind: 'wrong-steal' })
  assert.deepEqual(revealOnCorrectSteal, { revealAnswer: true, revealCountry: false })
  assert.deepEqual(revealOnWrongSteal, { revealAnswer: true, revealCountry: false })
})

test('video correct country reveals country list only', () => {
  const outcome = getRevealOutcome({
    roundType: 'video',
    entryKind: 'bonus',
    bonus: { label: 'Correct country', points: 1, revealCountry: true },
  })
  assert.deepEqual(outcome, { revealAnswer: false, revealCountry: true })
})
