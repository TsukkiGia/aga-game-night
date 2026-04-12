import test from 'node:test'
import assert from 'node:assert/strict'
import rounds from '../src/rounds.js'
import {
  buildPlanCatalog,
  defaultPlanIds,
  normalizePlanIdsWithRoundIntros,
  normalizeCursorId,
  normalizeDoneQuestionIds,
  resolveEffectivePlanForSync,
  legacyPairToItemId,
  questionItemIdFor,
} from '../src/gamePlan.js'

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

test('normalizeCursorId maps legacy pair to item id and enforces plan membership', () => {
  const mapped = legacyPairToItemId([0, 0], catalog)
  assert.ok(mapped)

  const included = normalizeCursorId([0, 0], defaultPlanIds(catalog), catalog)
  assert.equal(included, mapped)

  const roundIntroOnly = [catalog.introIdByRoundIndex.get(0)]
  const excluded = normalizeCursorId([0, 0], roundIntroOnly, catalog)
  assert.equal(excluded, null)
})

test('normalizeDoneQuestionIds converts legacy done keys and filters invalid/non-question ids', () => {
  const qId = questionItemIdFor(0, 0, catalog)
  const introId = catalog.introIdByRoundIndex.get(0)
  const normalized = normalizeDoneQuestionIds(['0-0', qId, introId, 'bad', '0-0'], catalog)

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
      scoring: [{ label: 'Correct', points: 3, phase: 'normal' }],
      questions: [{ id: 'cq-1', promptType: 'text', promptText: 'Prompt', answer: 'Answer' }],
    },
  ])
  const ids = customCatalog.items.map((item) => item.id)
  assert.equal(new Set(ids).size, ids.length)
})
