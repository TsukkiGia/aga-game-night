export const CUSTOM_ROUND_TYPE = 'custom-buzz'

const DEFAULT_BUILTIN_TYPES = ['video', 'slang', 'charades', 'thesis']
const DEFAULT_PROMPT_TYPES = ['text', 'image', 'video']

function toSet(values, fallback = []) {
  const list = Array.isArray(values) ? values : fallback
  return new Set(list.map((value) => String(value || '').trim().toLowerCase()).filter(Boolean))
}

export function createRoundCatalogNormalizer(options = {}) {
  const maxRules = Number.isInteger(options.maxRules) && options.maxRules > 0 ? options.maxRules : 20
  const maxQuestions = Number.isInteger(options.maxQuestions) && options.maxQuestions > 0 ? options.maxQuestions : 200
  const builtinTypes = toSet(options.builtinRoundTypes, DEFAULT_BUILTIN_TYPES)
  const promptTypes = toSet(options.promptTypes, DEFAULT_PROMPT_TYPES)
  const legacyScoringLabelMaxLength = Number.isInteger(options.legacyScoringLabelMaxLength) && options.legacyScoringLabelMaxLength > 0
    ? options.legacyScoringLabelMaxLength
    : 120
  const customQuestionIdFactory = typeof options.customQuestionIdFactory === 'function'
    ? options.customQuestionIdFactory
    : ((index) => `cq-${index + 1}`)

  function cleanString(value, maxLength = 5000) {
    const normalized = String(value || '').trim()
    if (!normalized) return ''
    return normalized.slice(0, maxLength)
  }

  function cleanInt(value, fallback = 0) {
    const parsed = Number.parseInt(value, 10)
    return Number.isInteger(parsed) ? parsed : fallback
  }

  function isHttpUrl(value) {
    const input = cleanString(value, 2000)
    if (!input) return false
    try {
      const url = new URL(input)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }

  function normalizeRules(rawRules) {
    if (!Array.isArray(rawRules)) return []
    const next = []
    for (const rule of rawRules) {
      const value = cleanString(rule, 240)
      if (!value) continue
      next.push(value)
      if (next.length >= maxRules) break
    }
    return next
  }

  function normalizeAcceptedAnswers(rawAcceptedAnswers) {
    if (!Array.isArray(rawAcceptedAnswers)) return []
    const next = []
    const seen = new Set()
    for (const raw of rawAcceptedAnswers) {
      const value = cleanString(raw, 240)
      if (!value) continue
      const key = value.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      next.push(value)
      if (next.length >= 20) break
    }
    return next
  }

  function normalizeNewScoring(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
    const correctPoints = cleanInt(raw.correctPoints, 3)
    const wrongPoints = cleanInt(raw.wrongPoints, -1)
    const stealEnabled = raw.stealEnabled !== false
    const correctStealPoints = cleanInt(raw.correctStealPoints, 2)
    const wrongStealPoints = cleanInt(raw.wrongStealPoints, 0)
    const correctLabel = cleanString(raw.correctLabel, 120) || null
    const wrongLabel = cleanString(raw.wrongLabel, 120) || null
    const bonuses = Array.isArray(raw.bonuses)
      ? raw.bonuses.map((bonus) => {
          if (!bonus || typeof bonus !== 'object') return null
          const label = cleanString(bonus.label, 120)
          if (!label) return null
          const points = cleanInt(bonus.points, 0)
          return {
            label,
            points,
            ...(bonus.revealCountry ? { revealCountry: true } : {}),
            ...(bonus.noReveal ? { noReveal: true } : {}),
          }
        }).filter(Boolean).slice(0, 10)
      : []
    return {
      correctPoints,
      wrongPoints,
      correctLabel,
      wrongLabel,
      stealEnabled,
      correctStealPoints,
      wrongStealPoints,
      bonuses,
    }
  }

  function migrateOldScoringArray(arr) {
    const entries = arr.map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const label = cleanString(entry.label, legacyScoringLabelMaxLength)
      if (!label) return null
      const points = cleanInt(entry.points, 0)
      const phaseRaw = cleanString(entry.phase, 16).toLowerCase()
      const isSteal = phaseRaw === 'steal' || (!phaseRaw && label.toLowerCase().includes('steal'))
      return { label, points, isSteal }
    }).filter(Boolean)

    const stealEntries = entries.filter((entry) => entry.isSteal)
    const normalEntries = entries.filter((entry) => !entry.isSteal)
    if (normalEntries.length === 0) return null

    const maxPoints = Math.max(...normalEntries.map((entry) => entry.points))
    const correctEntry = normalEntries.find((entry) => entry.points === maxPoints) || normalEntries[0]
    const remaining = normalEntries.filter((entry) => entry !== correctEntry)
    const wrongEntry = remaining.find((entry) => entry.points < 0) || remaining[remaining.length - 1] || null
    const bonusEntries = remaining.filter((entry) => entry !== wrongEntry)

    const correctSteal = stealEntries.find((entry) => entry.points > 0) || stealEntries[0] || null
    const wrongSteal = stealEntries.find((entry) => entry !== correctSteal) || null

    return {
      correctPoints: correctEntry.points,
      wrongPoints: wrongEntry ? wrongEntry.points : -1,
      correctLabel: correctEntry.label !== 'Correct answer' ? correctEntry.label : null,
      wrongLabel: wrongEntry && wrongEntry.label !== 'Wrong answer' ? wrongEntry.label : null,
      stealEnabled: stealEntries.length > 0,
      correctStealPoints: correctSteal ? correctSteal.points : 2,
      wrongStealPoints: wrongSteal ? wrongSteal.points : 0,
      bonuses: bonusEntries.map((entry) => ({ label: entry.label, points: entry.points })),
    }
  }

  function normalizeScoring(rawScoring) {
    if (Array.isArray(rawScoring)) {
      const migrated = migrateOldScoringArray(rawScoring)
      return migrated ? normalizeNewScoring(migrated) : null
    }
    return normalizeNewScoring(rawScoring)
  }

  function normalizeCustomQuestion(rawQuestion, index) {
    if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) return null
    const promptType = cleanString(rawQuestion.promptType, 16).toLowerCase()
    if (!promptTypes.has(promptType)) return null

    const promptText = cleanString(rawQuestion.promptText, 500)
    const mediaUrl = cleanString(rawQuestion.mediaUrl, 2000)
    const answer = cleanString(rawQuestion.answer, 200)
    const explanation = cleanString(rawQuestion.explanation, 2000)
    const acceptedAnswers = normalizeAcceptedAnswers(rawQuestion.acceptedAnswers)
    const id = cleanString(rawQuestion.id, 80) || cleanString(customQuestionIdFactory(index, rawQuestion), 80)
    if (!id || !answer) return null

    if (promptType === 'text' && !promptText) return null
    if ((promptType === 'image' || promptType === 'video') && !isHttpUrl(mediaUrl)) return null

    return {
      id,
      promptType,
      ...(promptText ? { promptText } : {}),
      ...(mediaUrl ? { mediaUrl } : {}),
      answer,
      ...(acceptedAnswers.length > 0 ? { acceptedAnswers } : {}),
      ...(explanation ? { explanation } : {}),
    }
  }

  function normalizeCustomQuestions(rawQuestions) {
    if (!Array.isArray(rawQuestions)) return []
    const next = []
    const seen = new Set()
    for (let i = 0; i < rawQuestions.length; i += 1) {
      const normalized = normalizeCustomQuestion(rawQuestions[i], i)
      if (!normalized) continue
      if (seen.has(normalized.id)) continue
      seen.add(normalized.id)
      next.push(normalized)
      if (next.length >= maxQuestions) break
    }
    return next
  }

  function normalizeBuiltinQuestion(rawQuestion, index, roundId) {
    if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) return null
    const id = cleanString(rawQuestion.id, 80) || `${roundId}-q${index + 1}`
    const out = { id }
    const passthroughStringFields = [
      'video',
      'answer',
      'explanation',
      'language',
      'country',
      'term',
      'sentence',
      'meaning',
      'phrase',
      'title',
    ]
    for (const field of passthroughStringFields) {
      const value = cleanString(rawQuestion[field], 5000)
      if (!value) continue
      out[field] = value
    }
    if (Array.isArray(rawQuestion.countries)) {
      out.countries = rawQuestion.countries
        .map((value) => cleanString(value, 120))
        .filter(Boolean)
        .slice(0, 30)
    }
    if (Array.isArray(rawQuestion.options)) {
      out.options = rawQuestion.options
        .map((value) => cleanString(value, 120))
        .filter(Boolean)
        .slice(0, 20)
    }
    const acceptedAnswers = normalizeAcceptedAnswers(rawQuestion.acceptedAnswers)
    if (acceptedAnswers.length > 0) out.acceptedAnswers = acceptedAnswers
    if (Object.keys(out).length <= 1) return null
    return out
  }

  function normalizeBuiltinQuestions(rawQuestions, roundId) {
    if (!Array.isArray(rawQuestions)) return []
    const next = []
    const seen = new Set()
    for (let i = 0; i < rawQuestions.length; i += 1) {
      const normalized = normalizeBuiltinQuestion(rawQuestions[i], i, roundId)
      if (!normalized) continue
      if (seen.has(normalized.id)) continue
      seen.add(normalized.id)
      next.push(normalized)
      if (next.length >= maxQuestions) break
    }
    return next
  }

  function normalizeRound(rawRound, index) {
    if (!rawRound || typeof rawRound !== 'object' || Array.isArray(rawRound)) return null
    const type = cleanString(rawRound.type, 40).toLowerCase()
    if (!type) return null
    if (!builtinTypes.has(type) && type !== CUSTOM_ROUND_TYPE) return null
    const id = cleanString(rawRound.id, 120) || `${type}-${index + 1}`
    const name = cleanString(rawRound.name, 120)
    if (!name) return null
    const scoring = normalizeScoring(rawRound.scoring)
    if (!scoring) return null
    const questions = type === CUSTOM_ROUND_TYPE
      ? normalizeCustomQuestions(rawRound.questions)
      : normalizeBuiltinQuestions(rawRound.questions, id)
    if (questions.length === 0) return null
    return {
      id,
      type,
      name,
      intro: cleanString(rawRound.intro, 2000),
      rules: normalizeRules(rawRound.rules),
      scoring,
      questions,
      ...(rawRound.templateId ? { templateId: cleanString(rawRound.templateId, 120) } : {}),
    }
  }

  function normalizeRoundCatalog(rawCatalog) {
    if (!Array.isArray(rawCatalog)) return []
    const out = []
    const seen = new Set()
    for (let i = 0; i < rawCatalog.length; i += 1) {
      const normalized = normalizeRound(rawCatalog[i], i)
      if (!normalized) continue
      if (seen.has(normalized.id)) continue
      seen.add(normalized.id)
      out.push(normalized)
    }
    return out
  }

  function normalizeRoundTemplatePayload(rawPayload) {
    if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return null
    const name = cleanString(rawPayload.name, 120)
    const intro = cleanString(rawPayload.intro, 2000)
    const rules = normalizeRules(rawPayload.rules)
    const scoring = normalizeScoring(rawPayload.scoring)
    const questions = normalizeCustomQuestions(rawPayload.questions)
    if (!name || !scoring || questions.length === 0) return null
    return {
      name,
      type: CUSTOM_ROUND_TYPE,
      intro,
      rules,
      scoring,
      questions,
    }
  }

  function templateToRound(template) {
    if (!template || typeof template !== 'object' || Array.isArray(template)) return null
    const templateId = cleanString(template.templateId || template.id, 120)
    if (!templateId) return null
    return normalizeRound({
      id: `custom-template-${templateId}`,
      templateId,
      type: CUSTOM_ROUND_TYPE,
      name: template.name,
      intro: template.intro,
      rules: template.rules,
      scoring: template.scoring,
      questions: template.questions,
    }, 0)
  }

  function roundFromTemplateRow(row) {
    const templateId = cleanString(row?.id, 120)
    if (!templateId) return null
    const type = cleanString(row?.type, 40).toLowerCase()
    if (type !== CUSTOM_ROUND_TYPE) return null
    const round = templateToRound({
      id: templateId,
      templateId,
      type,
      name: row?.name,
      intro: row?.intro,
      rules: row?.rules,
      scoring: row?.scoring,
      questions: row?.questions,
    })
    if (!round) return null
    return {
      ...round,
      createdAt: row?.created_at || null,
    }
  }

  function isCustomTemplateRound(round) {
    return cleanString(round?.type, 40).toLowerCase() === CUSTOM_ROUND_TYPE
      && Boolean(cleanString(round?.templateId, 120))
  }

  return {
    normalizeRoundCatalog,
    normalizeRoundTemplatePayload,
    templateToRound,
    roundFromTemplateRow,
    isCustomTemplateRound,
  }
}
