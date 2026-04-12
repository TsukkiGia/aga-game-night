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

export function scoringPhase(entry) {
  const explicit = cleanString(entry?.phase, 16).toLowerCase()
  if (explicit === 'steal') return 'steal'
  if (explicit === 'normal') return 'normal'
  const label = cleanString(entry?.label, 120).toLowerCase()
  return label.includes('steal') ? 'steal' : 'normal'
}

export function normalizeScoring(rawScoring) {
  if (!Array.isArray(rawScoring)) return []
  const out = []
  const seen = new Set()
  for (const row of rawScoring) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue
    const label = cleanString(row.label, 120)
    if (!label) continue
    const dedupeKey = label.toLowerCase()
    if (seen.has(dedupeKey)) continue
    const points = cleanInt(row.points, 0)
    const phase = scoringPhase(row)
    out.push({ label, points, phase })
    seen.add(dedupeKey)
    if (out.length >= 20) break
  }
  return out
}

function normalizeCustomQuestion(rawQuestion, index) {
  if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) return null
  const promptType = cleanString(rawQuestion.promptType, 16).toLowerCase()
  if (!PROMPT_TYPES.has(promptType)) return null

  const promptText = cleanString(rawQuestion.promptText, 500)
  const mediaUrl = cleanString(rawQuestion.mediaUrl, 2000)
  const answer = cleanString(rawQuestion.answer, 200)
  const explanation = cleanString(rawQuestion.explanation, 2000)
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
  if (scoring.length === 0) return null
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

export function isCustomRound(round) {
  return cleanString(round?.type, 40).toLowerCase() === CUSTOM_ROUND_TYPE
}

export function isCustomTemplateRound(round) {
  return isCustomRound(round) && Boolean(cleanString(round?.templateId, 120))
}
