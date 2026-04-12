import { randomUUID } from 'node:crypto'

const MAX_RULES = 20
const MAX_SCORING = 20
const MAX_QUESTIONS = 200

const BUILTIN_ROUND_TYPES = new Set(['video', 'slang', 'charades', 'thesis'])
export const CUSTOM_ROUND_TYPE = 'custom-buzz'
const SUPPORTED_PROMPT_TYPES = new Set(['text', 'image', 'video'])

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
    if (next.length >= MAX_RULES) break
  }
  return next
}

function normalizeScoring(rawScoring) {
  if (!Array.isArray(rawScoring)) return []
  const next = []
  const seen = new Set()
  for (const entry of rawScoring) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    const label = cleanString(entry.label, 100)
    if (!label) continue
    const dedupeKey = label.toLowerCase()
    if (seen.has(dedupeKey)) continue
    const points = cleanInt(entry.points, 0)
    const phaseRaw = cleanString(entry.phase, 16).toLowerCase()
    const phase = phaseRaw === 'steal' ? 'steal' : 'normal'
    next.push({ label, points, phase })
    seen.add(dedupeKey)
    if (next.length >= MAX_SCORING) break
  }
  return next
}

function normalizeCustomQuestion(rawQuestion, index) {
  if (!rawQuestion || typeof rawQuestion !== 'object' || Array.isArray(rawQuestion)) return null
  const promptType = cleanString(rawQuestion.promptType, 16).toLowerCase()
  if (!SUPPORTED_PROMPT_TYPES.has(promptType)) return null
  const promptText = cleanString(rawQuestion.promptText, 500)
  const mediaUrl = cleanString(rawQuestion.mediaUrl, 2000)
  const answer = cleanString(rawQuestion.answer, 200)
  const explanation = cleanString(rawQuestion.explanation, 2000)
  if (!answer) return null

  if (promptType === 'text' && !promptText) return null
  if ((promptType === 'image' || promptType === 'video') && !isHttpUrl(mediaUrl)) return null

  const baseId = cleanString(rawQuestion.id, 80) || `cq-${index + 1}-${randomUUID().slice(0, 8)}`

  return {
    id: baseId,
    promptType,
    ...(promptText ? { promptText } : {}),
    ...(mediaUrl ? { mediaUrl } : {}),
    answer,
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
    const id = normalized.id
    if (seen.has(id)) continue
    seen.add(id)
    next.push(normalized)
    if (next.length >= MAX_QUESTIONS) break
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
    if (next.length >= MAX_QUESTIONS) break
  }
  return next
}

export function normalizeRoundCatalog(rawCatalog) {
  if (!Array.isArray(rawCatalog)) return []
  const out = []
  const seenRoundIds = new Set()

  for (let i = 0; i < rawCatalog.length; i += 1) {
    const round = rawCatalog[i]
    if (!round || typeof round !== 'object' || Array.isArray(round)) continue

    const type = cleanString(round.type, 40).toLowerCase()
    if (!type) continue
    if (!BUILTIN_ROUND_TYPES.has(type) && type !== CUSTOM_ROUND_TYPE) continue

    const id = cleanString(round.id, 120) || `${type}-${i + 1}`
    if (seenRoundIds.has(id)) continue
    const templateId = type === CUSTOM_ROUND_TYPE ? cleanString(round.templateId, 120) : ''

    const name = cleanString(round.name, 120)
    if (!name) continue

    const intro = cleanString(round.intro, 2000)
    const rules = normalizeRules(round.rules)
    const scoring = normalizeScoring(round.scoring)
    if (scoring.length === 0) continue

    const questions = type === CUSTOM_ROUND_TYPE
      ? normalizeCustomQuestions(round.questions)
      : normalizeBuiltinQuestions(round.questions, id)
    if (questions.length === 0) continue

    out.push({
      id,
      type,
      name,
      intro,
      rules,
      scoring,
      questions,
      ...(templateId ? { templateId } : {}),
    })
    seenRoundIds.add(id)
  }

  return out
}

export function normalizeRoundTemplatePayload(rawPayload) {
  if (!rawPayload || typeof rawPayload !== 'object' || Array.isArray(rawPayload)) return null
  const name = cleanString(rawPayload.name, 120)
  const intro = cleanString(rawPayload.intro, 2000)
  const rules = normalizeRules(rawPayload.rules)
  const scoring = normalizeScoring(rawPayload.scoring)
  const questions = normalizeCustomQuestions(rawPayload.questions)

  if (!name || scoring.length === 0 || questions.length === 0) return null
  return {
    name,
    type: CUSTOM_ROUND_TYPE,
    intro,
    rules,
    scoring,
    questions,
  }
}

export function roundFromTemplateRow(row) {
  const templateId = cleanString(row?.id, 120)
  if (!templateId) return null
  const type = cleanString(row?.type, 40).toLowerCase()
  if (type !== CUSTOM_ROUND_TYPE) return null
  const name = cleanString(row?.name, 120)
  if (!name) return null

  const rules = normalizeRules(row?.rules)
  const scoring = normalizeScoring(row?.scoring)
  const questions = normalizeCustomQuestions(row?.questions)
  if (scoring.length === 0 || questions.length === 0) return null

  return {
    id: `custom-template-${templateId}`,
    templateId,
    type: CUSTOM_ROUND_TYPE,
    name,
    intro: cleanString(row?.intro, 2000),
    rules,
    scoring,
    questions,
    createdAt: row?.created_at || null,
  }
}
