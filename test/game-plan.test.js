import test from 'node:test'
import assert from 'node:assert/strict'
import rounds from '../src/core/rounds.js'
import {
  buildPlanCatalog,
  defaultPlanIds,
  normalizePlanIdsWithRoundIntros,
  normalizeCursorId,
  normalizeDoneQuestionIds,
  resolveEffectivePlanForSync,
  questionItemIdFor,
} from '../src/core/gamePlan.js'

const catalog = buildPlanCatalog(rounds)

test('plan catalog item ids are unique to avoid cursor/plan collisions', () => {
  const ids = catalog.items.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('resolveEffectivePlanForSync keeps local plan when server plan is empty', () => {
  const localPlan = [
    questionItemIdFor(1, 0, catalog),
    questionItemIdFor(1, 1, catalog),
  ]
  const expected = normalizePlanIdsWithRoundIntros(localPlan, catalog, { fallbackToDefault: true })
  const actual = resolveEffectivePlanForSync([], localPlan, catalog)

  assert.deepEqual(actual, expected)
  assert.notDeepEqual(actual, defaultPlanIds(catalog))
})

test('resolveEffectivePlanForSync prefers non-empty server plan', () => {
  const localPlan = [questionItemIdFor(0, 0, catalog)]
  const serverPlan = [questionItemIdFor(2, 0, catalog), questionItemIdFor(2, 1, catalog)]
  const expected = normalizePlanIdsWithRoundIntros(serverPlan, catalog, { fallbackToDefault: true })
  const actual = resolveEffectivePlanForSync(serverPlan, localPlan, catalog)

  assert.deepEqual(actual, expected)
})

test('normalizePlanIdsWithRoundIntros inserts round intro ahead of selected questions', () => {
  const qId = questionItemIdFor(3, 0, catalog)
  const introId = catalog.introIdByRoundIndex.get(3)
  const normalized = normalizePlanIdsWithRoundIntros([qId], catalog, { fallbackToDefault: false })

  assert.deepEqual(normalized, [introId, qId])
})

test('normalizeCursorId accepts only cursor ids and enforces plan membership', () => {
  const qId = questionItemIdFor(0, 0, catalog)
  const included = normalizeCursorId(qId, defaultPlanIds(catalog), catalog)
  assert.equal(included, qId)
  const roundIntroOnly = [catalog.introIdByRoundIndex.get(0)]
  const excluded = normalizeCursorId(qId, roundIntroOnly, catalog)
  assert.equal(excluded, null)
  const legacyPair = normalizeCursorId([0, 0], defaultPlanIds(catalog), catalog)
  assert.equal(legacyPair, null)
})

test('normalizeDoneQuestionIds keeps only valid question ids', () => {
  const qId = questionItemIdFor(0, 0, catalog)
  const introId = catalog.introIdByRoundIndex.get(0)
  const normalized = normalizeDoneQuestionIds(['0-0', qId, introId, 'bad', qId], catalog)

  assert.deepEqual(normalized, [qId])
})

test('plan catalog keeps unique ids with built-in and custom rounds combined', () => {
  const customCatalog = buildPlanCatalog([
    ...rounds,
    {
      id: 'custom-template-xyz',
      type: 'custom-buzz',
      name: 'Custom',
      intro: '',
      rules: ['Rule'],
      scoring: { correctPoints: 3, wrongPoints: -1, stealEnabled: true, correctStealPoints: 2, wrongStealPoints: 0, bonuses: [] },
      questions: [{ id: 'cq-1', promptType: 'text', promptText: 'Prompt', answer: 'Answer' }],
    },
  ])
  const ids = customCatalog.items.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
})
