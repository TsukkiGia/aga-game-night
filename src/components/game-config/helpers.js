import { buildPlanCatalog, normalizePlanIdsWithRoundIntros } from '../../gamePlan'
import { CUSTOM_ROUND_TYPE } from '../../roundCatalog'
import { cleanUrl } from '../../utils/mediaPrompt'

export function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

export function buildInitialSelection(initialPlanIds, catalogRounds) {
  const planCatalog = buildPlanCatalog(catalogRounds)
  const normalized = normalizePlanIdsWithRoundIntros(initialPlanIds, planCatalog, { fallbackToDefault: false })
  const selected = new Set()
  for (const id of normalized) {
    const item = planCatalog.byId.get(id)
    if (!item || item.type !== 'question') continue
    selected.add(item.id)
  }
  return selected
}

export function buildEditorSnapshot({ name, intro, rules, scoring, questions }) {
  const normalizedRules = Array.isArray(rules)
    ? rules.map((rule) => String(rule || '').trim())
    : []
  const normalizedScoring = Array.isArray(scoring)
    ? scoring.map((row) => ({
      label: String(row?.label || '').trim(),
      points: Number.parseInt(row?.points, 10) || 0,
      phase: String(row?.phase || 'normal').trim().toLowerCase() === 'steal' ? 'steal' : 'normal',
    }))
    : []
  const normalizedQuestions = Array.isArray(questions)
    ? questions.map((question, index) => ({
      id: String(question?.id || '').trim() || `q-${index + 1}`,
      promptType: String(question?.promptType || 'text').trim().toLowerCase(),
      promptText: String(question?.promptText || '').trim(),
      mediaUrl: String(question?.mediaUrl || '').trim(),
      answer: String(question?.answer || '').trim(),
      explanation: String(question?.explanation || '').trim(),
    }))
    : []

  return JSON.stringify({
    name: String(name || '').trim(),
    intro: String(intro || '').trim(),
    rules: normalizedRules,
    scoring: normalizedScoring,
    questions: normalizedQuestions,
  })
}

export function roundTooltipText(round) {
  const intro = String(round?.intro || '').trim()
  if (intro) return intro
  const firstRule = Array.isArray(round?.rules) ? String(round.rules[0] || '').trim() : ''
  if (firstRule) return firstRule
  return 'No description available for this round yet.'
}

function truncatePreview(value, max = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

export function questionPreviewHeadline(round, question, questionIndex) {
  if (!question || typeof question !== 'object') return `Question ${questionIndex + 1}`

  if (round.type === CUSTOM_ROUND_TYPE) {
    const promptType = String(question.promptType || '').trim().toLowerCase()
    if (promptType === 'text') return truncatePreview(question.promptText, 180) || `Text prompt ${questionIndex + 1}`
    if (promptType === 'image') return truncatePreview(question.promptText, 180) || `Image prompt ${questionIndex + 1}`
    if (promptType === 'video') return truncatePreview(question.promptText, 180) || `Video prompt ${questionIndex + 1}`
  }

  if (round.type === 'video') return `Video clip ${questionIndex + 1}`
  if (round.type === 'slang') return truncatePreview(question.term, 180) || `Slang term ${questionIndex + 1}`
  if (round.type === 'charades') return truncatePreview(question.phrase, 180) || `Charade ${questionIndex + 1}`
  if (round.type === 'thesis') return truncatePreview(question.title, 180) || `Title ${questionIndex + 1}`

  return `Question ${questionIndex + 1}`
}

export function questionPreviewDetail(round, question) {
  if (!question || typeof question !== 'object') return ''
  if (round.type === CUSTOM_ROUND_TYPE) {
    const promptType = String(question.promptType || '').trim().toLowerCase()
    if (promptType === 'text') return ''
    if (promptType === 'image' || promptType === 'video') return ''
  }

  if (round.type === 'slang') return truncatePreview(question.sentence, 190)
  if (round.type === 'thesis' && Array.isArray(question.options) && question.options.length > 0) {
    return truncatePreview(question.options.join(' · '), 190)
  }
  if (round.type === 'video' && Array.isArray(question.countries) && question.countries.length > 0) {
    return truncatePreview(`Countries: ${question.countries.join(', ')}`, 190)
  }
  return ''
}

export function questionPreviewTags(round, question) {
  const tags = []
  if (!question || typeof question !== 'object') return tags

  if (round.type === CUSTOM_ROUND_TYPE) {
    const promptType = String(question.promptType || '').trim().toLowerCase()
    if (promptType === 'text') tags.push('Text')
    if (promptType === 'image') tags.push('Image')
    if (promptType === 'video') tags.push('Video')
  }

  if (round.type === 'slang') {
    const country = String(question.country || '').trim()
    if (country) tags.push(country)
  }

  if (round.type === 'video') tags.push('Buzz Round')
  if (round.type === 'charades') tags.push('Acting Prompt')
  if (round.type === 'thesis') tags.push('Translate Title')

  return tags
}

export function questionPreviewAnswer(round, question) {
  if (!round || !question || typeof question !== 'object') return ''

  if (round.type === CUSTOM_ROUND_TYPE) return truncatePreview(question.answer, 220)
  if (round.type === 'video') return truncatePreview(question.answer, 220)
  if (round.type === 'slang') return truncatePreview(question.meaning, 220)
  if (round.type === 'charades') return truncatePreview(question.phrase, 220)
  if (round.type === 'thesis') return ''

  return ''
}

export function questionPreviewMedia(round, question) {
  if (!round || !question || typeof question !== 'object') return null

  if (round.type === CUSTOM_ROUND_TYPE) {
    const promptType = String(question.promptType || '').trim().toLowerCase()
    const mediaUrl = cleanUrl(question.mediaUrl)
    if ((promptType === 'image' || promptType === 'video') && mediaUrl) {
      return { type: promptType, rawUrl: mediaUrl }
    }
    return null
  }

  if (round.type === 'video') {
    const videoUrl = cleanUrl(question.video)
    if (!videoUrl) return null
    return { type: 'video', rawUrl: videoUrl }
  }

  return null
}
