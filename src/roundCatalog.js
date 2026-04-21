export const CUSTOM_ROUND_TYPE = 'custom-buzz'

const BUILTIN_TYPES = new Set(['video', 'slang', 'charades', 'thesis'])
const PROMPT_TYPES = new Set(['text', 'image', 'video'])

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
  const raw = cleanString(value, 2000)
  if (!raw) return false
  try {
    const url = new URL(raw)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

function normalizeRules(rawRules) {
  if (!Array.isArray(rawRules)) return []
  return rawRules
    .map((value) => cleanString(value, 240))
    .filter(Boolean)
    .slice(0, 20)
}

function normalizeAcceptedAnswers(rawAcceptedAnswers) {
  if (!Array.isArray(rawAcceptedAnswers)) return []
  const out = []
  const seen = new Set()
  for (const raw of rawAcceptedAnswers) {
    const value = cleanString(raw, 240)
    if (!value) continue
    const key = value.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(value)
    if (out.length >= 20) break
  }
  return out
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
    ? raw.bonuses.map((b) => {
        if (!b || typeof b !== 'object') return null
        const label = cleanString(b.label, 120)
        if (!label) return null
        const points = cleanInt(b.points, 0)
        return {
          label, points,
          ...(b.revealCountry ? { revealCountry: true } : {}),
          ...(b.noReveal ? { noReveal: true } : {}),
        }
      }).filter(Boolean).slice(0, 10)
    : []
  return { correctPoints, wrongPoints, correctLabel, wrongLabel, stealEnabled, correctStealPoints, wrongStealPoints, bonuses }
}

function migrateOldScoringArray(arr) {
  const entries = arr.map((e) => {
    if (!e || typeof e !== 'object') return null
    const label = cleanString(e.label, 120)
    if (!label) return null
    const points = cleanInt(e.points, 0)
    const phaseRaw = cleanString(e.phase, 16).toLowerCase()
    const isSteal = phaseRaw === 'steal' || (!phaseRaw && label.toLowerCase().includes('steal'))
    return { label, points, isSteal }
  }).filter(Boolean)

  const stealEntries = entries.filter((e) => e.isSteal)
  const normalEntries = entries.filter((e) => !e.isSteal)
  if (normalEntries.length === 0) return null

  const maxPoints = Math.max(...normalEntries.map((e) => e.points))
  const correctEntry = normalEntries.find((e) => e.points === maxPoints) || normalEntries[0]
  const remaining = normalEntries.filter((e) => e !== correctEntry)
  const wrongEntry = remaining.find((e) => e.points < 0) || remaining[remaining.length - 1] || null
  const bonusEntries = remaining.filter((e) => e !== wrongEntry)

  const correctSteal = stealEntries.find((e) => e.points > 0) || stealEntries[0] || null
  const wrongSteal = stealEntries.find((e) => e !== correctSteal) || null

  return {
    correctPoints: correctEntry.points,
    wrongPoints: wrongEntry ? wrongEntry.points : -1,
    correctLabel: correctEntry.label !== 'Correct answer' ? correctEntry.label : null,
    wrongLabel: wrongEntry && wrongEntry.label !== 'Wrong answer' ? wrongEntry.label : null,
    stealEnabled: stealEntries.length > 0,
    correctStealPoints: correctSteal ? correctSteal.points : 2,
    wrongStealPoints: wrongSteal ? wrongSteal.points : 0,
    bonuses: bonusEntries.map((e) => ({ label: e.label, points: e.points })),
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
  if (!PROMPT_TYPES.has(promptType)) return null

  const promptText = cleanString(rawQuestion.promptText, 500)
  const mediaUrl = cleanString(rawQuestion.mediaUrl, 2000)
  const answer = cleanString(rawQuestion.answer, 200)
  const explanation = cleanString(rawQuestion.explanation, 2000)
  const acceptedAnswers = normalizeAcceptedAnswers(rawQuestion.acceptedAnswers)
  const id = cleanString(rawQuestion.id, 80) || `cq-${index + 1}`
  if (!answer) return null
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
  const out = []
  const seen = new Set()
  for (let i = 0; i < rawQuestions.length; i += 1) {
    const normalized = normalizeCustomQuestion(rawQuestions[i], i)
    if (!normalized) continue
    if (seen.has(normalized.id)) continue
    seen.add(normalized.id)
    out.push(normalized)
    if (out.length >= 200) break
  }
  return out
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
  const out = []
  const seen = new Set()
  for (let i = 0; i < rawQuestions.length; i += 1) {
    const normalized = normalizeBuiltinQuestion(rawQuestions[i], i, roundId)
    if (!normalized) continue
    if (seen.has(normalized.id)) continue
    seen.add(normalized.id)
    out.push(normalized)
    if (out.length >= 200) break
  }
  return out
}

function normalizeRound(rawRound, index) {
  if (!rawRound || typeof rawRound !== 'object' || Array.isArray(rawRound)) return null
  const type = cleanString(rawRound.type, 40).toLowerCase()
  if (!type) return null
  if (!BUILTIN_TYPES.has(type) && type !== CUSTOM_ROUND_TYPE) return null
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

export function normalizeRoundCatalog(rawCatalog) {
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

export function templateToRound(template) {
  if (!template || typeof template !== 'object' || Array.isArray(template)) return null
  const templateId = cleanString(template.templateId || template.id, 120)
  if (!templateId) return null
  const normalized = normalizeRound({
    id: `custom-template-${templateId}`,
    templateId,
    type: CUSTOM_ROUND_TYPE,
    name: template.name,
    intro: template.intro,
    rules: template.rules,
    scoring: template.scoring,
    questions: template.questions,
  }, 0)
  return normalized
}

export function isCustomTemplateRound(round) {
  return cleanString(round?.type, 40).toLowerCase() === CUSTOM_ROUND_TYPE
    && Boolean(cleanString(round?.templateId, 120))
}
