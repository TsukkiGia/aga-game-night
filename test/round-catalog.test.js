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
      scoring: [{ label: 'Correct', points: 3, phase: 'normal' }],
      questions: [{ id: 'cq-1', promptType: 'text', promptText: 'Prompt', answer: 'Answer' }],
    },
  ])

  assert.equal(normalized.length, 1)
  assert.equal(normalized[0].templateId, '123')
})
