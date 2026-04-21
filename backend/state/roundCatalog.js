import { randomUUID } from 'node:crypto'
import { createRoundCatalogNormalizer, CUSTOM_ROUND_TYPE } from '../../shared/roundCatalogCore.js'

const roundCatalogNormalizer = createRoundCatalogNormalizer({
  customQuestionIdFactory: (index) => `cq-${index + 1}-${randomUUID().slice(0, 8)}`,
})

export const {
  normalizeRoundCatalog,
  normalizeRoundTemplatePayload,
  roundFromTemplateRow,
} = roundCatalogNormalizer

export { CUSTOM_ROUND_TYPE }
