import test from 'node:test'
import assert from 'node:assert/strict'
import { isGuessCorrect, resolveHostlessQuestionContext } from '../backend/state/hostlessMode.js'

test('alias answers are accepted for host-less matching', () => {
  assert.equal(isGuessCorrect('jollof', 'Jollof Rice', ['Jollof']), true)
})

test('context derives generic dish aliases for shorthand guesses', () => {
  const context = resolveHostlessQuestionContext({
    hostQuestionCursor: 'q:dishes:d1',
    roundCatalog: [
      {
        id: 'dishes',
        type: 'custom-buzz',
        questions: [
          {
            id: 'd1',
            answer: 'Jollof Rice',
          },
        ],
      },
    ],
  })

  assert.equal(context.expectedAnswers.includes('Jollof'), true)
  assert.equal(isGuessCorrect('jollof', context.expectedAnswer, context.expectedAnswers), true)
})

test('resolveHostlessQuestionContext exposes primary answer plus aliases', () => {
  const context = resolveHostlessQuestionContext({
    hostQuestionCursor: 'q:african-dishes:dish-01',
    roundCatalog: [
      {
        id: 'african-dishes',
        type: 'custom-buzz',
        questions: [
          {
            id: 'dish-01',
            answer: 'Jollof Rice',
            acceptedAnswers: ['Jollof'],
          },
        ],
      },
    ],
  })

  assert.equal(context.expectedAnswer, 'Jollof Rice')
  assert.deepEqual(context.expectedAnswers, ['Jollof Rice', 'Jollof'])
  assert.equal(context.canAcceptAnswers, true)
})

test('resolveHostlessQuestionContext derives slang meaning aliases from list-style meanings', () => {
  const context = resolveHostlessQuestionContext({
    hostQuestionCursor: 'q:slang-bee:r2q3',
    roundCatalog: [
      {
        id: 'slang-bee',
        type: 'slang',
        questions: [
          {
            id: 'r2q3',
            term: 'Ngori',
            meaning: 'Trouble or difficulty',
          },
        ],
      },
    ],
  })

  assert.equal(context.expectedAnswer, 'Trouble or difficulty')
  assert.equal(context.expectedAnswers.includes('Trouble'), true)
  assert.equal(context.expectedAnswers.includes('difficulty'), true)
  assert.equal(isGuessCorrect('trouble', context.expectedAnswer, context.expectedAnswers), true)
  assert.equal(isGuessCorrect('difficulty', context.expectedAnswer, context.expectedAnswers), true)
})
