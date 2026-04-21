import test from 'node:test'
import assert from 'node:assert/strict'
import rounds from '../src/core/rounds.js'
import { buildPlanCatalog } from '../src/core/gamePlan.js'
import { buildHealthyDefaultSelection } from '../src/components/game-config/helpers.js'

test('healthy default selection targets language/slang/flag rounds only with balanced counts', () => {
  const selected = buildHealthyDefaultSelection(rounds)
  const planCatalog = buildPlanCatalog(rounds)

  const countByRoundName = new Map()
  rounds.forEach((round, roundIndex) => {
    const questionIds = planCatalog.questionIdsByRoundIndex.get(roundIndex) || []
    const count = questionIds.filter((id) => selected.has(id)).length
    countByRoundName.set(round.name, count)
  })

  const expectedTargets = new Map([
    ['Guess the Language', 10],
    ['Slang Bee', 8],
    ['Flags by Image', 12],
    ['Flag Trivia (Verbal Clues)', 8],
  ])

  for (const [roundName, targetCount] of expectedTargets) {
    const round = rounds.find((entry) => entry.name === roundName)
    assert.ok(round, `Missing round "${roundName}" in catalog`)
    const selectedCount = countByRoundName.get(roundName) || 0
    assert.equal(selectedCount, Math.min(targetCount, round.questions.length))
  }

  for (const round of rounds) {
    if (expectedTargets.has(round.name)) continue
    assert.equal(countByRoundName.get(round.name) || 0, 0, `Expected no default selections in ${round.name}`)
  }
})

