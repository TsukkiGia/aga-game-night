import { buildPlanCatalog, defaultPlanIds, normalizePlanIdsWithRoundIntros } from '../../gamePlan.js'
import { CUSTOM_ROUND_TYPE } from '../../roundCatalog.js'
import { cleanUrl } from '../../utils/mediaPrompt.js'

const HEALTHY_DEFAULT_TARGETS = [
  { roundNames: ['guess the language'], count: 10 },
  { roundNames: ['slang bee'], count: 8 },
  { roundIds: ['flags-by-image'], roundNames: ['flags by image'], count: 12 },
  { roundIds: ['flag-trivia-descriptions'], roundNames: ['flag trivia (verbal clues)', 'flag trivia descriptions'], count: 8 },
]

function normalizeLookupKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function pickEvenly(questionIds, desiredCount) {
  const total = Array.isArray(questionIds) ? questionIds.length : 0
  const count = Number.parseInt(desiredCount, 10)
  if (total <= 0 || !Number.isInteger(count) || count <= 0) return []
  if (count >= total) return [...questionIds]

  const picked = []
  const used = new Set()
  const denom = Math.max(count - 1, 1)
  for (let i = 0; i < count; i += 1) {
    let index = Math.round((i * (total - 1)) / denom)
    while (used.has(index) && index < total - 1) index += 1
    if (used.has(index)) {
      index = 0
      while (used.has(index) && index < total - 1) index += 1
    }
    used.add(index)
    picked.push(questionIds[index])
  }
  return picked
}

export function buildHealthyDefaultSelection(catalogRounds) {
  if (!Array.isArray(catalogRounds) || catalogRounds.length === 0) return new Set()
  const planCatalog = buildPlanCatalog(catalogRounds)
  const rows = catalogRounds.map((round, roundIndex) => ({
    round,
    questionIds: planCatalog.questionIdsByRoundIndex.get(roundIndex) || [],
  }))

  const selected = new Set()
  for (const target of HEALTHY_DEFAULT_TARGETS) {
    const targetIds = new Set((target.roundIds || []).map(normalizeLookupKey))
    const targetNames = new Set((target.roundNames || []).map(normalizeLookupKey))
    const row = rows.find(({ round }) => {
      const roundIdKey = normalizeLookupKey(round?.id)
      const roundNameKey = normalizeLookupKey(round?.name)
      return targetIds.has(roundIdKey) || targetNames.has(roundNameKey)
    })
    if (!row) continue
    pickEvenly(row.questionIds, target.count).forEach((id) => selected.add(id))
  }

  return selected
}

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

export function buildSnapshotPayloadFromSelection({ roundRows, planCatalog, selectedQuestionIds }) {
  const rows = Array.isArray(roundRows) ? roundRows : []
  const selected = selectedQuestionIds instanceof Set ? selectedQuestionIds : new Set()
  const catalog = planCatalog || null
  const snapshotRounds = []

  for (const row of rows) {
    const questionIds = Array.isArray(row?.questionIds) ? row.questionIds : []
    const selectedForRound = questionIds.filter((id) => selected.has(id))
    if (selectedForRound.length === 0) continue
    const questions = selectedForRound
      .map((id) => {
        const item = catalog?.byId?.get(id)
        if (!item || item.type !== 'question') return null
        const question = row?.round?.questions?.[item.questionIndex]
        return question ? cloneJson(question) : null
      })
      .filter(Boolean)
    if (questions.length === 0) continue
    snapshotRounds.push({
      id: row.round.id,
      templateId: row.round.templateId || undefined,
      name: row.round.name,
      type: row.round.type,
      intro: row.round.intro || '',
      rules: cloneJson(row.round.rules || []),
      scoring: cloneJson(row.round.scoring || {}),
      questions,
    })
  }

  const snapshotPlanCatalog = buildPlanCatalog(snapshotRounds)
  return {
    roundCatalog: snapshotRounds,
    planIds: defaultPlanIds(snapshotPlanCatalog),
  }
}

export function buildEditorSnapshot({ name, intro, rules, scoring, questions }) {
  const normalizedRules = Array.isArray(rules)
    ? rules.map((rule) => String(rule || '').trim())
    : []
  const s = (scoring && typeof scoring === 'object' && !Array.isArray(scoring)) ? scoring : {}
  const normalizedScoring = {
    correctPoints: Number.parseInt(s.correctPoints, 10) || 3,
    wrongPoints: Number.parseInt(s.wrongPoints, 10) || -1,
    correctLabel: String(s.correctLabel || '').trim() || null,
    wrongLabel: String(s.wrongLabel || '').trim() || null,
    stealEnabled: s.stealEnabled !== false,
    correctStealPoints: Number.parseInt(s.correctStealPoints, 10) || 2,
    wrongStealPoints: Number.parseInt(s.wrongStealPoints, 10) || 0,
    bonuses: Array.isArray(s.bonuses)
      ? s.bonuses
          .filter((b) => b && String(b.label || '').trim())
          .map((b) => ({ label: String(b.label || '').trim(), points: Number.parseInt(b.points, 10) || 0 }))
      : [],
  }
  const normalizedQuestions = Array.isArray(questions)
    ? questions.map((question, index) => {
      const promptType = String(question?.promptType || 'text').trim().toLowerCase()
      const hasMedia = promptType === 'image' || promptType === 'video'
      return {
        id: String(question?.id || '').trim() || `q-${index + 1}`,
        promptType,
        promptText: String(question?.promptText || '').trim(),
        mediaUrl: hasMedia ? String(question?.mediaUrl || '').trim() : '',
        answer: String(question?.answer || '').trim(),
        explanation: String(question?.explanation || '').trim(),
      }
    })
    : []

  return JSON.stringify({
    name: String(name || '').trim(),
    intro: String(intro || '').trim(),
    rules: normalizedRules,
    scoring: normalizedScoring,
    questions: normalizedQuestions,
  })
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
