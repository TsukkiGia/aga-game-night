import test from 'node:test'
import assert from 'node:assert/strict'
import rounds from '../src/core/rounds.js'
import { buildPlanCatalog } from '../src/core/gamePlan.js'
import { buildSnapshotPayloadFromSelection } from '../src/components/game-config/helpers.js'

function buildRoundRows(catalogRounds, planCatalog) {
  return catalogRounds.map((round, roundIndex) => ({
    round,
    roundIndex,
    questionIds: planCatalog.questionIdsByRoundIndex.get(roundIndex) || [],
  }))
}

test('snapshot payload contains exactly selected questions and matching plan ids', () => {
  const catalogRounds = rounds.filter((round) => (
    round.name === 'Guess the Language'
    || round.name === 'Slang Bee'
    || round.name === 'Flags by Image'
  ))
  const planCatalog = buildPlanCatalog(catalogRounds)
  const roundRows = buildRoundRows(catalogRounds, planCatalog)

  const selectedQuestionIds = new Set([
    roundRows[0].questionIds[0],
    roundRows[0].questionIds[5],
    roundRows[1].questionIds[0],
    roundRows[2].questionIds[0],
    roundRows[2].questionIds[8],
  ].filter(Boolean))

  const payload = buildSnapshotPayloadFromSelection({
    roundRows,
    planCatalog,
    selectedQuestionIds,
  })

  assert.equal(payload.roundCatalog.length, 3)
  const payloadQuestionCount = payload.roundCatalog.reduce((sum, round) => sum + round.questions.length, 0)
  assert.equal(payloadQuestionCount, selectedQuestionIds.size)

  const selectedStableQuestionIds = [...selectedQuestionIds].map((itemId) => planCatalog.byId.get(itemId)?.questionId).filter(Boolean)
  const payloadStableQuestionIds = payload.roundCatalog.flatMap((round) => round.questions.map((question) => question.id))
  assert.deepEqual(new Set(payloadStableQuestionIds), new Set(selectedStableQuestionIds))

  const payloadPlanCatalog = buildPlanCatalog(payload.roundCatalog)
  const payloadPlanQuestionCount = payloadPlanCatalog.items.filter((item) => item.type === 'question').length
  const payloadPlanIntroCount = payloadPlanCatalog.items.filter((item) => item.type === 'round-intro').length
  assert.equal(payloadPlanQuestionCount, selectedQuestionIds.size)
  assert.equal(payloadPlanIntroCount, payload.roundCatalog.length)
  assert.equal(payload.planIds.length, payloadPlanQuestionCount + payloadPlanIntroCount)
})

test('snapshot payload reflects edited custom round content immediately', () => {
  const customRound = {
    id: 'custom-template-session-edit',
    templateId: 'template-abc',
    type: 'custom-buzz',
    name: 'Session Custom Round',
    intro: 'Custom intro',
    rules: ['Rule 1'],
    scoring: [{ label: 'Correct answer', points: 3, phase: 'normal' }],
    questions: [{ id: 'cq-1', promptType: 'text', promptText: 'Prompt', answer: 'Old Answer' }],
  }
  const catalogRounds = [customRound]
  const planCatalog = buildPlanCatalog(catalogRounds)
  const roundRows = buildRoundRows(catalogRounds, planCatalog)
  const selectedQuestionIds = new Set([roundRows[0].questionIds[0]])

  const before = buildSnapshotPayloadFromSelection({ roundRows, planCatalog, selectedQuestionIds })
  assert.equal(before.roundCatalog[0].questions[0].answer, 'Old Answer')

  roundRows[0].round.questions[0].answer = 'Updated Answer'
  const after = buildSnapshotPayloadFromSelection({ roundRows, planCatalog, selectedQuestionIds })
  assert.equal(after.roundCatalog[0].questions[0].answer, 'Updated Answer')
})

