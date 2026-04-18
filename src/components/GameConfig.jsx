import { useEffect, useMemo, useState } from 'react'
import rounds from '../rounds'
import { buildPlanCatalog, defaultPlanIds, normalizePlanIdsWithRoundIntros } from '../gamePlan'
import {
  CUSTOM_ROUND_TYPE,
  isCustomTemplateRound,
  normalizeRoundCatalog,
  templateToRound,
} from '../roundCatalog'
import { cleanUrl, mediaUrlFeedback, toYouTubeEmbedUrl } from '../utils/mediaPrompt'

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function buildInitialSelection(initialPlanIds, catalogRounds) {
  const planCatalog = buildPlanCatalog(catalogRounds)
  const normalized = normalizePlanIdsWithRoundIntros(initialPlanIds, planCatalog, { fallbackToDefault: true })
  const selected = new Set()
  for (const id of normalized) {
    const item = planCatalog.byId.get(id)
    if (!item || item.type !== 'question') continue
    selected.add(item.id)
  }
  return selected
}

const DEFAULT_SCORING = [
  { label: 'Correct answer', points: 3, phase: 'normal' },
  { label: 'Wrong answer', points: -1, phase: 'normal' },
  { label: 'Correct steal', points: 2, phase: 'steal' },
  { label: 'Wrong steal', points: 0, phase: 'steal' },
]

const DEFAULT_QUESTION = {
  promptType: 'text',
  promptText: '',
  mediaUrl: '',
  answer: '',
  explanation: '',
}

function roundTooltipText(round) {
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

function questionPreviewHeadline(round, question, questionIndex) {
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

function questionPreviewDetail(round, question) {
  if (!question || typeof question !== 'object') return ''
  if (round.type === CUSTOM_ROUND_TYPE) {
    const promptType = String(question.promptType || '').trim().toLowerCase()
    if (promptType === 'text') return ''
    if (promptType === 'image' || promptType === 'video') return truncatePreview(question.mediaUrl, 150)
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

function questionPreviewTags(round, question) {
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

function questionPreviewAnswer(round, question) {
  if (!round || !question || typeof question !== 'object') return ''

  if (round.type === CUSTOM_ROUND_TYPE) return truncatePreview(question.answer, 220)
  if (round.type === 'video') return truncatePreview(question.answer, 220)
  if (round.type === 'slang') return truncatePreview(question.meaning, 220)
  if (round.type === 'charades') return truncatePreview(question.phrase, 220)
  if (round.type === 'thesis') return ''

  return ''
}

function questionPreviewMedia(round, question) {
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

function QuestionPreviewMedia({ round, question }) {
  const media = useMemo(() => questionPreviewMedia(round, question), [round, question])
  const [failed, setFailed] = useState(false)

  if (!media) return null

  const isHttp = /^https?:\/\//i.test(media.rawUrl)
  const youtubeEmbedUrl = media.type === 'video' && isHttp ? toYouTubeEmbedUrl(media.rawUrl) : null
  const videoSrc = isHttp ? media.rawUrl : `/videos/${media.rawUrl.replace(/^\/+/, '')}`

  return (
    <div className="game-config-preview-media-wrap">
      {failed ? (
        <div className="game-config-preview-media-fallback">Could not load preview media.</div>
      ) : media.type === 'image' ? (
        <img
          className="game-config-preview-media-image"
          src={media.rawUrl}
          alt="Question media preview"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : youtubeEmbedUrl ? (
        <iframe
          className="game-config-preview-media-video"
          src={youtubeEmbedUrl}
          title="Question media preview"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          className="game-config-preview-media-video"
          src={videoSrc}
          controls
          preload="metadata"
          muted
          playsInline
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

function MediaPreview({ promptType, mediaUrl }) {
  const url = cleanUrl(mediaUrl)
  const [status, setStatus] = useState('idle')
  const youtubeEmbed = useMemo(() => (
    promptType === 'video' ? toYouTubeEmbedUrl(url) : null
  ), [promptType, url])

  if (!url || (promptType !== 'image' && promptType !== 'video')) return null

  return (
    <div className="game-config-media-preview">
      <div className={`game-config-media-preview-badge status-${status}`}>
        {status === 'ok' ? 'Preview loaded' : status === 'error' ? 'Could not load preview' : 'Loading preview...'}
      </div>
      {promptType === 'image' ? (
        <img
          className="game-config-media-preview-image"
          src={url}
          alt="Prompt preview"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      ) : youtubeEmbed ? (
        <iframe
          className="game-config-media-preview-frame"
          src={youtubeEmbed}
          title="Video preview"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      ) : (
        <video
          className="game-config-media-preview-video"
          src={url}
          controls
          preload="metadata"
          onLoadedData={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  )
}

export default function GameConfig({
  session,
  initialRoundCatalog,
  initialPlanIds,
  onConfirm,
  onBack,
}) {
  const builtinRounds = useMemo(() => normalizeRoundCatalog(rounds), [])
  const initialCatalog = useMemo(() => {
    const normalized = normalizeRoundCatalog(initialRoundCatalog)
    return normalized.length > 0 ? normalized : builtinRounds
  }, [initialRoundCatalog, builtinRounds])

  const [customTemplates, setCustomTemplates] = useState(() =>
    initialCatalog.filter((round) => isCustomTemplateRound(round))
  )
  const [templatesLoading, setTemplatesLoading] = useState(false)
  const [templatesError, setTemplatesError] = useState('')

  const [showCreator, setShowCreator] = useState(false)
  const [previewRoundId, setPreviewRoundId] = useState('')
  const [creatorMode, setCreatorMode] = useState('create')
  const [editingRoundId, setEditingRoundId] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState('')
  const [sessionEditedRoundIds, setSessionEditedRoundIds] = useState(() => new Set())
  const [createError, setCreateError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState({ roundId: '', text: '' })
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateIntro, setNewTemplateIntro] = useState('')
  const [newTemplateRules, setNewTemplateRules] = useState([])
  const [newTemplateScoring, setNewTemplateScoring] = useState(() => cloneJson(DEFAULT_SCORING))
  const [newTemplateQuestions, setNewTemplateQuestions] = useState(() => [cloneJson(DEFAULT_QUESTION)])

  function nextQuestionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `cq-${crypto.randomUUID()}`
    return `cq-${Date.now()}-${Math.floor(Math.random() * 100000)}`
  }

  useEffect(() => {
    if ((!showCreator && !previewRoundId) || typeof document === 'undefined') return undefined
    const { style } = document.body
    const prevOverflow = style.overflow
    const prevPaddingRight = style.paddingRight
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth

    style.overflow = 'hidden'
    if (scrollbarWidth > 0) style.paddingRight = `${scrollbarWidth}px`

    return () => {
      style.overflow = prevOverflow
      style.paddingRight = prevPaddingRight
    }
  }, [showCreator, previewRoundId])

  const combinedCatalog = useMemo(() => {
    const byId = new Map()
    builtinRounds.forEach((round) => byId.set(round.id, round))
    // Session edits/custom templates override built-ins by shared id.
    customTemplates.forEach((round) => byId.set(round.id, round))
    return [...byId.values()]
  }, [builtinRounds, customTemplates])

  const PLAN_CATALOG = useMemo(() => buildPlanCatalog(combinedCatalog), [combinedCatalog])
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(() =>
    buildInitialSelection(initialPlanIds, initialCatalog)
  )
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!session?.code || !session?.pin) return undefined

    async function loadTemplates() {
      setTemplatesLoading(true)
      setTemplatesError('')
      try {
        const res = await fetch('/api/round-templates', {
          headers: {
            'x-session-code': session.code,
            'x-host-pin': session.pin,
          },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (cancelled) return
          setTemplatesError('Could not load custom rounds.')
          return
        }
        const fromApi = Array.isArray(data.templates)
          ? data.templates.map((template) => templateToRound(template)).filter(Boolean)
          : []
        if (cancelled) return

        setCustomTemplates((prev) => {
          const byId = new Map()
          prev.forEach((round) => byId.set(round.id, round))
          fromApi.forEach((round) => byId.set(round.id, round))
          return [...byId.values()]
        })
      } catch {
        if (!cancelled) setTemplatesError('Could not load custom rounds.')
      } finally {
        if (!cancelled) setTemplatesLoading(false)
      }
    }

    void loadTemplates()
    return () => { cancelled = true }
  }, [session?.code, session?.pin])

  const roundRows = useMemo(() => {
    return combinedCatalog.map((round, roundIndex) => {
      const questionIds = PLAN_CATALOG.questionIdsByRoundIndex.get(roundIndex) || []
      const selectedCount = questionIds.filter((id) => selectedQuestionIds.has(id)).length
      return {
        round,
        roundIndex,
        questionIds,
        selectedCount,
        allSelected: selectedCount === questionIds.length,
        noneSelected: selectedCount === 0,
      }
    })
  }, [combinedCatalog, PLAN_CATALOG, selectedQuestionIds])

  const totalQuestions = useMemo(
    () => roundRows.reduce((sum, row) => sum + row.questionIds.length, 0),
    [roundRows]
  )

  const previewRow = useMemo(
    () => roundRows.find((row) => row.round.id === previewRoundId) || null,
    [roundRows, previewRoundId]
  )
  const selectedQuestions = useMemo(
    () => roundRows.reduce((sum, row) => sum + row.selectedCount, 0),
    [roundRows]
  )

  function toggleRound(roundIndex) {
    const questionIds = PLAN_CATALOG.questionIdsByRoundIndex.get(roundIndex) || []
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev)
      const selectedCount = questionIds.filter((id) => next.has(id)).length
      const shouldSelectAll = selectedCount !== questionIds.length
      for (const id of questionIds) {
        if (shouldSelectAll) next.add(id)
        else next.delete(id)
      }
      return next
    })
    setError('')
  }

  function openRoundPreview(roundId) {
    setPreviewRoundId(String(roundId || '').trim())
  }

  function closeRoundPreview() {
    setPreviewRoundId('')
    setSaveSuccess((prev) => (prev.roundId ? { roundId: '', text: '' } : prev))
  }

  function toggleQuestion(questionId) {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
    setError('')
  }

  function handleResetDefault() {
    const defaultCatalog = buildPlanCatalog(builtinRounds)
    const defaults = defaultPlanIds(defaultCatalog)
    setSelectedQuestionIds(buildInitialSelection(defaults, builtinRounds))
    setError('')
  }

  function handleContinue() {
    const snapshotRounds = []
    for (const row of roundRows) {
      const selectedForRound = row.questionIds.filter((id) => selectedQuestionIds.has(id))
      if (selectedForRound.length === 0) continue
      const questions = selectedForRound
        .map((id) => {
          const item = PLAN_CATALOG.byId.get(id)
          if (!item || item.type !== 'question') return null
          const question = row.round.questions[item.questionIndex]
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
        scoring: cloneJson(row.round.scoring || []),
        questions,
      })
    }

    if (snapshotRounds.length === 0) {
      setError('Select at least one question to continue.')
      return
    }

    const snapshotPlanCatalog = buildPlanCatalog(snapshotRounds)
    const nextPlanIds = defaultPlanIds(snapshotPlanCatalog)
    onConfirm({
      planIds: nextPlanIds,
      roundCatalog: snapshotRounds,
    })
  }

  function resetCreator() {
    setCreatorMode('create')
    setEditingRoundId('')
    setEditingTemplateId('')
    setNewTemplateName('')
    setNewTemplateIntro('')
    setNewTemplateRules([])
    setNewTemplateScoring(cloneJson(DEFAULT_SCORING))
    setNewTemplateQuestions([cloneJson(DEFAULT_QUESTION)])
    setCreateError('')
  }

  function closeCreator(options = {}) {
    const modeAtClose = creatorMode
    const roundIdAtClose = String(editingRoundId || '').trim()
    const shouldReturnToPreview = options.returnToPreview ?? (modeAtClose === 'session-edit')
    setShowCreator(false)
    resetCreator()
    if (shouldReturnToPreview && roundIdAtClose) setPreviewRoundId(roundIdAtClose)
  }

  function openCreateTemplateModal() {
    resetCreator()
    setCreatorMode('create')
    setShowCreator(true)
  }

  function openEditRoundModal(round) {
    if (!round || round.type !== CUSTOM_ROUND_TYPE) return
    setPreviewRoundId('')
    setCreatorMode('session-edit')
    setEditingRoundId(String(round.id || '').trim())
    setEditingTemplateId(String(round.templateId || '').trim())
    setNewTemplateName(String(round.name || '').trim())
    setNewTemplateIntro(String(round.intro || '').trim())
    setNewTemplateRules(Array.isArray(round.rules) ? cloneJson(round.rules) : [])
    setNewTemplateScoring(Array.isArray(round.scoring) ? cloneJson(round.scoring) : cloneJson(DEFAULT_SCORING))
    setNewTemplateQuestions(
      Array.isArray(round.questions) && round.questions.length > 0
        ? round.questions.map((question) => ({
            id: question?.id || nextQuestionId(),
            promptType: question?.promptType || 'text',
            promptText: question?.promptText || '',
            mediaUrl: question?.mediaUrl || '',
            answer: question?.answer || '',
            explanation: question?.explanation || '',
          }))
        : [{ ...cloneJson(DEFAULT_QUESTION), id: nextQuestionId() }]
    )
    setCreateError('')
    setShowCreator(true)
  }

  function validateTemplate() {
    if (!newTemplateName.trim()) return 'Round name is required.'

    const filledScoring = newTemplateScoring.filter((row) => String(row.label || '').trim())
    if (filledScoring.length === 0) return 'Add at least one scoring row with a label.'

    if (newTemplateQuestions.length === 0) return 'Add at least one question.'
    for (let i = 0; i < newTemplateQuestions.length; i += 1) {
      const q = newTemplateQuestions[i]
      if (!String(q.answer || '').trim()) return `Q${i + 1}: answer is required.`
      if (q.promptType === 'text' && !String(q.promptText || '').trim()) return `Q${i + 1}: prompt text is required.`
      if ((q.promptType === 'image' || q.promptType === 'video') && !String(q.mediaUrl || '').trim()) return `Q${i + 1}: media URL is required.`
      const feedback = mediaUrlFeedback(q)
      if (feedback?.kind === 'error') return `Q${i + 1}: ${feedback.message}`
    }
    return null
  }

  async function handleCreateTemplate() {
    const validationError = validateTemplate()
    if (validationError) {
      setCreateError(validationError)
      return
    }

    if (!session?.code || !session?.pin) {
      setCreateError('Session credentials are required.')
      return
    }

    const payload = {
      name: newTemplateName,
      intro: newTemplateIntro,
      type: CUSTOM_ROUND_TYPE,
      rules: newTemplateRules.map((rule) => String(rule || '').trim()).filter(Boolean),
      scoring: newTemplateScoring.map((row) => ({
        label: row.label,
        points: Number(row.points),
        phase: row.phase,
      })),
      questions: newTemplateQuestions.map((question) => ({
        id: question.id,
        promptType: question.promptType,
        promptText: question.promptText,
        mediaUrl: question.mediaUrl,
        answer: question.answer,
        explanation: question.explanation,
      })),
    }

    setCreateSubmitting(true)
    setCreateError('')
    try {
      const res = await fetch('/api/round-templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-code': session.code,
          'x-host-pin': session.pin,
        },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.template) {
        setCreateError(data.error === 'invalid-template' ? 'Template is incomplete or invalid.' : 'Could not create template.')
        return
      }
      const normalized = templateToRound(data.template)
      if (!normalized) {
        setCreateError('Template was saved but could not be loaded.')
        return
      }
      setCustomTemplates((prev) => {
        const exists = prev.some((round) => round.id === normalized.id)
        return exists ? prev : [normalized, ...prev]
      })
      closeCreator()
    } catch {
      setCreateError('Could not create template.')
    } finally {
      setCreateSubmitting(false)
    }
  }

  function handleSaveSessionRoundEdits() {
    const validationError = validateTemplate()
    if (validationError) {
      setCreateError(validationError)
      return
    }
    const roundId = String(editingRoundId || '').trim()
    if (!roundId) {
      setCreateError('Could not find the selected round to edit.')
      return
    }

    const normalized = normalizeRoundCatalog([{
      id: roundId,
      templateId: editingTemplateId || undefined,
      name: newTemplateName,
      intro: newTemplateIntro,
      type: CUSTOM_ROUND_TYPE,
      rules: newTemplateRules.map((rule) => String(rule || '').trim()).filter(Boolean),
      scoring: newTemplateScoring.map((row) => ({
        label: row.label,
        points: Number(row.points),
        phase: row.phase,
      })),
      questions: newTemplateQuestions.map((question, index) => ({
        id: String(question?.id || '').trim() || `cq-${index + 1}`,
        promptType: question.promptType,
        promptText: question.promptText,
        mediaUrl: question.mediaUrl,
        answer: question.answer,
        explanation: question.explanation,
      })),
    }])[0]

    if (!normalized) {
      setCreateError('Round is incomplete or invalid.')
      return
    }

    setCustomTemplates((prev) => {
      const index = prev.findIndex((round) => round.id === roundId)
      if (index >= 0) return prev.map((round) => (round.id === roundId ? normalized : round))
      // Built-in custom-buzz rounds are not in customTemplates; inject an override entry.
      return [normalized, ...prev]
    })
    setSessionEditedRoundIds((prev) => {
      const next = new Set(prev)
      next.add(roundId)
      return next
    })
    setSaveSuccess({
      roundId,
      text: 'Saved. Preview updated for this session.',
    })
    closeCreator()
  }

  return (
    <div className="setup-container">
      <div className="setup-step game-config-step">
        <div className="setup-icon">🧭</div>
        <h2 className="setup-heading">Game Plan</h2>
        <p className="setup-sub">Choose exactly which rounds and questions to run this session.</p>
        <div className="game-config-toolbar">
          <div className="game-config-metric">
            <span className="game-config-metric-label">Selected</span>
            <span className="game-config-metric-value">{selectedQuestions} / {totalQuestions}</span>
          </div>
          <div className="game-config-metric game-config-metric-muted">
            <span className="game-config-metric-label">Rounds Active</span>
            <span className="game-config-metric-value">{roundRows.filter((row) => !row.noneSelected).length}</span>
          </div>
        </div>

        <div className="game-config-custom-bar">
          <div>
            <div className="game-config-custom-title">Custom Buzz Rounds</div>
            <div className="game-config-custom-sub">Saved rounds, available to all sessions.</div>
          </div>
          <button type="button" className="game-config-new-template-btn" onClick={openCreateTemplateModal}>
            + New Custom Round
          </button>
        </div>
        {templatesLoading && <p className="game-config-info">Loading custom rounds...</p>}
        {templatesError && <p className="session-gate-error">{templatesError}</p>}

        <div className="game-config-rounds">
          {roundRows.map(({ round, roundIndex, questionIds, selectedCount, allSelected, noneSelected }) => (
            <div key={round.id} className={`game-config-round-card type-${round.type}${noneSelected ? ' off' : ''}`}>
              <div className="game-config-round-head">
                <div className="game-config-round-title-wrap">
                  <span className="game-config-round-pill">
                    {round.type === CUSTOM_ROUND_TYPE ? 'CUSTOM' : `ROUND ${roundIndex + 1}`}
                  </span>
                  <div className="game-config-round-title-row">
                    <div className="game-config-round-title">{round.name}</div>
                    <span
                      className="game-config-round-info game-config-tooltip-trigger"
                      role="note"
                      data-tooltip={roundTooltipText(round)}
                      aria-label={`About ${round.name}`}
                      tabIndex={0}
                    >
                      ?
                    </span>
                  </div>
                  <div className="game-config-round-meta">{selectedCount} of {questionIds.length} questions selected</div>
                  {sessionEditedRoundIds.has(round.id) && (
                    <div className="game-config-round-edited-note">Edited for this game only</div>
                  )}
                </div>
                <div className="game-config-round-actions">
                  <button
                    type="button"
                    className="game-config-round-preview-btn"
                    onClick={() => openRoundPreview(round.id)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className="game-config-round-action"
                    onClick={() => toggleRound(roundIndex)}
                  >
                    {allSelected ? 'Clear Round' : 'Select Round'}
                  </button>
                </div>
              </div>
              <div className="game-config-round-preview-hint">
                Quick-select with chips or open preview to inspect full prompt content.
              </div>
              <div className="game-config-question-grid">
                {round.questions.map((question, questionIndex) => {
                  const questionId = questionIds[questionIndex]
                  const selected = Boolean(questionId) && selectedQuestionIds.has(questionId)
                  const isMedia = question?.promptType === 'image' || question?.promptType === 'video'
                  return (
                    <button
                      key={questionId || `${round.id}-q${questionIndex + 1}`}
                      type="button"
                      aria-pressed={selected}
                      className={`game-config-question-item${selected ? ' selected' : ''}`}
                      onClick={() => {
                        if (!questionId) return
                        toggleQuestion(questionId)
                      }}
                      title={isMedia ? `${question.promptType.toUpperCase()} prompt` : undefined}
                    >
                      <span className={`game-config-question-check${selected ? ' check' : ' plus'}`}>
                        {selected ? '✓' : '+'}
                      </span>
                      <span>Q{questionIndex + 1}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="session-gate-error">{error}</p>}

        <div className="setup-actions">
          <button type="button" className="back-btn" onClick={onBack}>← Back</button>
          <button type="button" className="back-btn" onClick={handleResetDefault}>Default</button>
          <button type="button" className="start-btn" onClick={handleContinue}>Continue →</button>
        </div>
      </div>

      {previewRow && (
        <div className="help-overlay">
          <div
            className={`help-popup game-config-preview-modal type-${previewRow.round.type}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="game-config-preview-header">
              <div className="game-config-preview-pill">
                {previewRow.round.type === CUSTOM_ROUND_TYPE ? 'Custom Round' : `Round ${previewRow.roundIndex + 1}`}
              </div>
              <div className="game-config-preview-title-row">
                <h3 className="game-config-preview-title">{previewRow.round.name}</h3>
                <span className="game-config-preview-count">
                  {previewRow.selectedCount} / {previewRow.questionIds.length} selected
                </span>
              </div>
              {previewRow.round.intro && (
                <p className="game-config-preview-intro">{previewRow.round.intro}</p>
              )}
              {saveSuccess.roundId === previewRow.round.id && (
                <div className="game-config-preview-success">{saveSuccess.text}</div>
              )}
              <div className="game-config-preview-actions">
                <button type="button" className="back-btn" onClick={closeRoundPreview}>Close</button>
                {previewRow.round.type === CUSTOM_ROUND_TYPE && (
                  <button
                    type="button"
                    className="game-config-round-edit-btn"
                    onClick={() => openEditRoundModal(previewRow.round)}
                  >
                    Edit For Game
                  </button>
                )}
                <button
                  type="button"
                  className="game-config-round-action"
                  onClick={() => toggleRound(previewRow.roundIndex)}
                >
                  {previewRow.allSelected ? 'Clear Round' : 'Select Round'}
                </button>
              </div>
            </div>

            <div className="game-config-preview-list">
              {previewRow.round.questions.map((question, questionIndex) => {
                const questionId = previewRow.questionIds[questionIndex]
                const selected = Boolean(questionId) && selectedQuestionIds.has(questionId)
                const headline = questionPreviewHeadline(previewRow.round, question, questionIndex)
                const detail = questionPreviewDetail(previewRow.round, question)
                const tags = questionPreviewTags(previewRow.round, question)
                const answer = questionPreviewAnswer(previewRow.round, question)
                return (
                  <div
                    key={questionId || `${previewRow.round.id}-q${questionIndex + 1}`}
                    className={`game-config-preview-question${selected ? ' selected' : ''}`}
                  >
                    <div className="game-config-preview-question-head">
                      <span className="game-config-preview-q-index">Q{questionIndex + 1}</span>
                      <button
                        type="button"
                        className={`game-config-preview-q-state${selected ? ' selected' : ''}`}
                        aria-pressed={selected}
                        onClick={() => {
                          if (!questionId) return
                          toggleQuestion(questionId)
                        }}
                      >
                        {selected ? 'Selected' : 'Select'}
                      </button>
                    </div>
                    <div className="game-config-preview-q-title">{headline}</div>
                    <QuestionPreviewMedia
                      key={`${String(question?.id || questionIndex)}:${String(question?.promptType || '')}:${String(question?.mediaUrl || question?.video || '')}`}
                      round={previewRow.round}
                      question={question}
                    />
                    {answer && (
                      <div className="game-config-preview-q-answer">
                        <span>Answer</span>
                        <strong>{answer}</strong>
                      </div>
                    )}
                    {detail && <div className="game-config-preview-q-detail">{detail}</div>}
                    {tags.length > 0 && (
                      <div className="game-config-preview-q-tags">
                        {tags.map((tag, tagIndex) => (
                          <span key={`${questionId || questionIndex}-tag-${tagIndex}`}>{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {showCreator && (
        <div className="help-overlay">
          <div className="help-popup game-config-template-modal" onClick={(e) => e.stopPropagation()}>
            <div className="game-config-template-header">
              {creatorMode === 'session-edit' && (
                <div className="game-config-template-header-actions">
                  <button
                    type="button"
                    className="game-config-template-header-back"
                    onClick={() => closeCreator({ returnToPreview: true })}
                  >
                    ← Back to Preview
                  </button>
                </div>
              )}
              <div className="help-popup-tag">
                {creatorMode === 'create' ? 'Create Custom Round' : 'Edit For This Game'}
              </div>
              <h3 className="help-popup-title">
                {creatorMode === 'create' ? 'Custom Buzz Template' : 'Round Session Copy'}
              </h3>
              <p className="help-popup-sub">
                {creatorMode === 'create'
                  ? 'Build a reusable buzz round with text, image, or video prompts.'
                  : 'These edits apply only to this game session. The shared template library stays unchanged.'}
              </p>
            </div>

            <div className="game-config-template-body">

              <div className="game-config-template-section">
                <div className="game-config-template-section-head"><span>Details</span></div>
                <div className="game-config-template-field-stack">
                  <label className="game-config-field-label">
                    Name
                    <input
                      className="team-name-input game-config-field"
                      type="text"
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      maxLength={120}
                      placeholder="Name this round"
                    />
                  </label>
                  <label className="game-config-field-label">
                    Intro
                    <textarea
                      className="team-name-input game-config-field game-config-template-textarea"
                      value={newTemplateIntro}
                      onChange={(e) => setNewTemplateIntro(e.target.value)}
                      maxLength={2000}
                      placeholder="Short intro shown at round start (optional)"
                    />
                  </label>
                </div>
              </div>

            <div className="game-config-template-section">
              <div className="game-config-template-section-head">
                <span>Rules</span>
              </div>
              {newTemplateRules.map((rule, idx) => (
                <div key={`rule-${idx}`} className="game-config-template-row">
                  <input
                    className="team-name-input game-config-field"
                    type="text"
                    value={rule}
                    onChange={(e) => setNewTemplateRules((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))}
                    placeholder={`Rule ${idx + 1}`}
                  />
                  <button
                    type="button"
                    className="game-config-remove-btn"
                    onClick={() => setNewTemplateRules((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))}
                    aria-label="Remove rule"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="game-config-add-row-btn"
                onClick={() => setNewTemplateRules((prev) => [...prev, ''])}
              >
                + Rule
              </button>
            </div>

            <div className="game-config-template-section">
              <div className="game-config-template-section-head">
                <span>Scoring</span>
              </div>
              <div className="game-config-score-col-heads">
                <span>Label</span>
                <span>Points</span>
                <span>Phase</span>
              </div>
              {newTemplateScoring.map((row, idx) => (
                <div key={`score-${idx}`} className="game-config-template-row game-config-template-row-score">
                  <input
                    className="team-name-input game-config-field"
                    type="text"
                    value={row.label}
                    onChange={(e) => setNewTemplateScoring((prev) => prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item)))}
                    placeholder="e.g. Correct answer"
                  />
                  <input
                    className="team-name-input game-config-field game-config-points-input"
                    type="number"
                    value={row.points}
                    onChange={(e) => setNewTemplateScoring((prev) => prev.map((item, i) => {
                      if (i !== idx) return item
                      const parsed = Number.parseInt(e.target.value, 10)
                      return { ...item, points: Number.isInteger(parsed) ? parsed : 0 }
                    }))}
                    placeholder="0"
                  />
                  <select
                    className="team-name-input game-config-field game-config-select"
                    value={row.phase}
                    onChange={(e) => setNewTemplateScoring((prev) => prev.map((item, i) => (i === idx ? { ...item, phase: e.target.value } : item)))}
                  >
                    <option value="normal">Normal buzz</option>
                    <option value="steal">Steal</option>
                  </select>
                  <button
                    type="button"
                    className="game-config-remove-btn"
                    onClick={() => setNewTemplateScoring((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))}
                    aria-label="Remove scoring row"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="game-config-add-row-btn"
                onClick={() => setNewTemplateScoring((prev) => [...prev, { label: '', points: 0, phase: 'normal' }])}
              >
                + Score Row
              </button>
            </div>

            <div className="game-config-template-section">
              <div className="game-config-template-section-head">
                <span>Questions</span>
              </div>
              {newTemplateQuestions.map((question, idx) => {
                const urlFeedback = mediaUrlFeedback(question)
                return (
                  <div key={`question-${idx}`} className="game-config-template-question-card">
                    <div className="game-config-template-question-head">
                      <span className="game-config-template-q-label">Q{idx + 1}</span>
                      <button
                        type="button"
                        className="game-config-remove-btn"
                        onClick={() => setNewTemplateQuestions((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))}
                        aria-label="Remove question"
                      >
                        ×
                      </button>
                    </div>
                    <label className="game-config-field-label">
                      <span className="game-config-field-label-row">
                        Prompt type
                        <span
                          className="game-config-inline-help game-config-tooltip-trigger"
                          role="note"
                          data-tooltip="Text shows written prompt only. Image shows a URL image plus optional caption. Video plays a URL video plus optional caption."
                          aria-label="Prompt type help"
                          tabIndex={0}
                        >
                          ?
                        </span>
                      </span>
                      <select
                        className="team-name-input game-config-field game-config-select"
                        value={question.promptType}
                        onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (
                          i === idx
                            ? { ...item, promptType: e.target.value, mediaUrl: '', promptText: '' }
                            : item
                        )))}
                      >
                        <option value="text">Text</option>
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                      </select>
                    </label>
                    {question.promptType === 'text' ? (
                      <input
                        className="team-name-input game-config-field"
                        type="text"
                        value={question.promptText}
                        onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, promptText: e.target.value } : item)))}
                        placeholder="Prompt text"
                      />
                    ) : (
                      <>
                        <input
                          className="team-name-input game-config-field"
                          type="text"
                          value={question.promptText}
                          onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, promptText: e.target.value } : item)))}
                          placeholder="Optional caption"
                        />
                        <input
                          className="team-name-input game-config-field"
                          type="url"
                          value={question.mediaUrl}
                          onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, mediaUrl: e.target.value } : item)))}
                          placeholder={question.promptType === 'image' ? 'Image URL (https://...)' : 'Video URL (https://... or YouTube link)'}
                        />
                        {urlFeedback && (
                          <div className={`game-config-url-feedback status-${urlFeedback.kind}`}>
                            {urlFeedback.message}
                          </div>
                        )}
                        <MediaPreview
                          key={`${question.promptType}:${String(question.mediaUrl || '').trim()}`}
                          promptType={question.promptType}
                          mediaUrl={question.mediaUrl}
                        />
                      </>
                    )}
                    <input
                      className="team-name-input game-config-field"
                      type="text"
                      value={question.answer}
                      onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, answer: e.target.value } : item)))}
                      placeholder="Correct answer"
                    />
                    <textarea
                      className="team-name-input game-config-field game-config-template-textarea"
                      value={question.explanation}
                      onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, explanation: e.target.value } : item)))}
                      placeholder="Explanation (optional, shown after reveal)"
                    />
                  </div>
                )
              })}
              <button
                type="button"
                className="game-config-add-row-btn"
                onClick={() => setNewTemplateQuestions((prev) => [...prev, { ...cloneJson(DEFAULT_QUESTION), id: nextQuestionId() }])}
              >
                + Question
              </button>
            </div>

            </div>{/* end game-config-template-body */}

            {createError && <p className="session-gate-error game-config-template-error">{createError}</p>}

            <div className="setup-actions game-config-template-footer">
              <button
                type="button"
                className="back-btn"
                onClick={() => closeCreator()}
                disabled={createSubmitting}
              >
                {creatorMode === 'session-edit' ? 'Back to Preview' : 'Cancel'}
              </button>
              <button
                type="button"
                className="start-btn"
                onClick={() => {
                  if (creatorMode === 'session-edit') handleSaveSessionRoundEdits()
                  else void handleCreateTemplate()
                }}
                disabled={createSubmitting}
              >
                {creatorMode === 'session-edit'
                  ? 'Save Session Round'
                  : (createSubmitting ? 'Creating...' : 'Create Template')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
