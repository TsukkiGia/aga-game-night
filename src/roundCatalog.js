import { createRoundCatalogNormalizer, CUSTOM_ROUND_TYPE } from '../shared/roundCatalogCore.js'

const roundCatalogNormalizer = createRoundCatalogNormalizer()

export const { normalizeRoundCatalog, templateToRound, isCustomTemplateRound } = roundCatalogNormalizer
export { CUSTOM_ROUND_TYPE }
