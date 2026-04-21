import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRoundCatalog } from '../backend/state/roundCatalog.js'

test('normalizeRoundCatalog keeps templateId for custom rounds', () => {
  const normalized = normalizeRoundCatalog([
    {
      id: 'custom-template-123',
      templateId: '123',
      type: 'custom-buzz',
      name: 'Custom Round',
      intro: '',
      rules: ['Rule'],
      scoring: { correctPoints: 3, wrongPoints: -1, stealEnabled: true, correctStealPoints: 2, wrongStealPoints: 0, bonuses: [] },
      questions: [{ id: 'cq-1', promptType: 'text', promptText: 'Prompt', answer: 'Answer' }],
    },
  ])

  assert.equal(normalized.length, 1)
  assert.equal(normalized[0].templateId, '123')
})
