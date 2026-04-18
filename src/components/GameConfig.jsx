import { useEffect, useMemo, useRef, useState } from 'react'
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
  const normalized = normalizePlanIdsWithRoundIntros(initialPlanIds, planCatalog, { fallbackToDefault: false })
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

function buildEditorSnapshot({ name, intro, rules, scoring, questions }) {
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

const DRAG_SCROLL_EDGE_PX = 120
const DRAG_SCROLL_MAX_STEP_PX = 16

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
  const shouldLoadTemplates = Boolean(session?.code && session?.pin)
  const [templatesLoading, setTemplatesLoading] = useState(() => shouldLoadTemplates)
  const [templatesBootstrapped, setTemplatesBootstrapped] = useState(() => !shouldLoadTemplates)
  const [templatesError, setTemplatesError] = useState('')

  const [showCreator, setShowCreator] = useState(false)
  const [previewRoundId, setPreviewRoundId] = useState('')
  const [previewSearch, setPreviewSearch] = useState('')
  const [creatorMode, setCreatorMode] = useState('create')
  const [editingRoundId, setEditingRoundId] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState('')
  const [sessionEditedRoundIds, setSessionEditedRoundIds] = useState(() => new Set())
  const [createError, setCreateError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState({ roundId: '', text: '' })
  const [editorBaseline, setEditorBaseline] = useState(() => buildEditorSnapshot({
    name: '',
    intro: '',
    rules: [],
    scoring: cloneJson(DEFAULT_SCORING),
    questions: [cloneJson(DEFAULT_QUESTION)],
  }))
  const [roundClearConfirmId, setRoundClearConfirmId] = useState('')
  const [recentlyClearedRound, setRecentlyClearedRound] = useState(null)
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

  const [roundOrder, setRoundOrder] = useState(() => combinedCatalog.map((round) => round.id))
  const [dragRoundId, setDragRoundId] = useState('')
  const dragPointerYRef = useRef(null)
  const dragAutoScrollRafRef = useRef(0)

  useEffect(() => {
    setRoundOrder((prev) => {
      const incomingIds = combinedCatalog.map((round) => round.id)
      const incomingSet = new Set(incomingIds)
      const kept = prev.filter((id) => incomingSet.has(id))
      const keptSet = new Set(kept)
      const missing = incomingIds.filter((id) => !keptSet.has(id))
      const next = [...kept, ...missing]
      if (next.length === prev.length && next.every((id, index) => id === prev[index])) return prev
      return next
    })
  }, [combinedCatalog])

  useEffect(() => {
    function stopAutoScroll() {
      if (typeof window !== 'undefined' && dragAutoScrollRafRef.current) {
        window.cancelAnimationFrame(dragAutoScrollRafRef.current)
      }
      dragAutoScrollRafRef.current = 0
      dragPointerYRef.current = null
    }

    if (!dragRoundId || typeof window === 'undefined') {
      stopAutoScroll()
      return undefined
    }

    const tick = () => {
      const pointerY = dragPointerYRef.current
      const viewportHeight = window.innerHeight || 0
      if (Number.isFinite(pointerY) && viewportHeight > 0) {
        const topEdge = DRAG_SCROLL_EDGE_PX
        const bottomEdge = viewportHeight - DRAG_SCROLL_EDGE_PX
        let delta = 0

        if (pointerY < topEdge) {
          const strength = Math.min(1, (topEdge - pointerY) / DRAG_SCROLL_EDGE_PX)
          delta = -Math.max(1, Math.round(strength * DRAG_SCROLL_MAX_STEP_PX))
        } else if (pointerY > bottomEdge) {
          const strength = Math.min(1, (pointerY - bottomEdge) / DRAG_SCROLL_EDGE_PX)
          delta = Math.max(1, Math.round(strength * DRAG_SCROLL_MAX_STEP_PX))
        }

        if (delta !== 0) window.scrollBy(0, delta)
      }

      dragAutoScrollRafRef.current = window.requestAnimationFrame(tick)
    }

    dragAutoScrollRafRef.current = window.requestAnimationFrame(tick)
    return () => stopAutoScroll()
  }, [dragRoundId])

  const orderedCatalog = useMemo(() => {
    const byId = new Map(combinedCatalog.map((round) => [round.id, round]))
    const ordered = roundOrder.map((id) => byId.get(id)).filter(Boolean)
    const orderedIds = new Set(ordered.map((round) => round.id))
    const missing = combinedCatalog.filter((round) => !orderedIds.has(round.id))
    return [...ordered, ...missing]
  }, [combinedCatalog, roundOrder])

  const PLAN_CATALOG = useMemo(() => buildPlanCatalog(orderedCatalog), [orderedCatalog])
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(() =>
    buildInitialSelection(initialPlanIds, initialCatalog)
  )
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    if (!session?.code || !session?.pin) {
      setTemplatesLoading(false)
      setTemplatesBootstrapped(true)
      return undefined
    }

    async function loadTemplates() {
      setTemplatesBootstrapped(false)
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
        if (!cancelled) {
          setTemplatesLoading(false)
          setTemplatesBootstrapped(true)
        }
      }
    }

    void loadTemplates()
    return () => { cancelled = true }
  }, [session?.code, session?.pin])

  const roundRows = useMemo(() => {
    return orderedCatalog.map((round, roundIndex) => {
      const questionIds = PLAN_CATALOG.questionIdsByRoundIndex.get(roundIndex) || []
      const selectedCount = questionIds.filter((id) => selectedQuestionIds.has(id)).length
      return {
        round,
        roundIndex,
        displayIndex: roundIndex + 1,
        questionIds,
        selectedCount,
        allSelected: selectedCount === questionIds.length,
        noneSelected: selectedCount === 0,
      }
    })
  }, [orderedCatalog, PLAN_CATALOG, selectedQuestionIds])

  const totalQuestions = useMemo(
    () => roundRows.reduce((sum, row) => sum + row.questionIds.length, 0),
    [roundRows]
  )

  const previewRow = useMemo(
    () => roundRows.find((row) => row.round.id === previewRoundId) || null,
    [roundRows, previewRoundId]
  )
  const previewSearchNormalized = useMemo(
    () => String(previewSearch || '').trim().toLowerCase(),
    [previewSearch]
  )
  const previewItems = useMemo(() => {
    if (!previewRow) return []
    return previewRow.round.questions
      .map((question, questionIndex) => {
        const questionId = previewRow.questionIds[questionIndex]
        const selected = Boolean(questionId) && selectedQuestionIds.has(questionId)
        const headline = questionPreviewHeadline(previewRow.round, question, questionIndex)
        const detail = questionPreviewDetail(previewRow.round, question)
        const tags = questionPreviewTags(previewRow.round, question)
        const answer = questionPreviewAnswer(previewRow.round, question)
        const searchable = [
          `q${questionIndex + 1}`,
          headline,
          detail,
          answer,
          ...tags,
          question?.promptText,
          question?.mediaUrl,
          question?.explanation,
          question?.answer,
          question?.term,
          question?.meaning,
          question?.sentence,
          question?.phrase,
          question?.title,
          Array.isArray(question?.options) ? question.options.join(' ') : '',
          Array.isArray(question?.countries) ? question.countries.join(' ') : '',
        ]
          .map((value) => String(value || '').toLowerCase())
          .join(' ')

        return {
          key: questionId || `${previewRow.round.id}-q${questionIndex + 1}`,
          question,
          questionIndex,
          questionId,
          selected,
          headline,
          detail,
          tags,
          answer,
          searchable,
        }
      })
      .filter((item) => !previewSearchNormalized || item.searchable.includes(previewSearchNormalized))
  }, [previewRow, previewSearchNormalized, selectedQuestionIds])
  const previewMatchesLabel = useMemo(() => {
    if (!previewRow || !previewSearchNormalized) return ''
    const count = previewItems.length
    const total = previewRow.questionIds.length
    return `${count} of ${total} match${count === 1 ? '' : 'es'}`
  }, [previewItems.length, previewRow, previewSearchNormalized])
  const selectedQuestions = useMemo(
    () => roundRows.reduce((sum, row) => sum + row.selectedCount, 0),
    [roundRows]
  )
  const currentEditorSnapshot = useMemo(() => buildEditorSnapshot({
    name: newTemplateName,
    intro: newTemplateIntro,
    rules: newTemplateRules,
    scoring: newTemplateScoring,
    questions: newTemplateQuestions,
  }), [newTemplateName, newTemplateIntro, newTemplateRules, newTemplateScoring, newTemplateQuestions])
  const isEditorDirty = showCreator && currentEditorSnapshot !== editorBaseline

  useEffect(() => {
    if (!roundClearConfirmId) return undefined
    const timer = setTimeout(() => setRoundClearConfirmId(''), 3500)
    return () => clearTimeout(timer)
  }, [roundClearConfirmId])

  useEffect(() => {
    if (!recentlyClearedRound) return undefined
    const timer = setTimeout(() => setRecentlyClearedRound(null), 7000)
    return () => clearTimeout(timer)
  }, [recentlyClearedRound])

  function handleRoundToggle(row) {
    if (!row) return
    const { round, questionIds, allSelected } = row
    if (allSelected && roundClearConfirmId !== round.id) {
      setRoundClearConfirmId(round.id)
      return
    }

    if (allSelected) {
      const clearedQuestionIds = questionIds.filter((id) => selectedQuestionIds.has(id))
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev)
        questionIds.forEach((id) => next.delete(id))
        return next
      })
      setRecentlyClearedRound({
        roundId: round.id,
        roundName: round.name,
        questionIds: clearedQuestionIds,
      })
    } else {
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev)
        questionIds.forEach((id) => next.add(id))
        return next
      })
      setRecentlyClearedRound(null)
    }
    setRoundClearConfirmId('')
    setError('')
  }

  function handleUndoClearRound() {
    if (!recentlyClearedRound?.questionIds?.length) return
    const ids = recentlyClearedRound.questionIds
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => {
        if (PLAN_CATALOG.byId.has(id)) next.add(id)
      })
      return next
    })
    setRecentlyClearedRound(null)
    setRoundClearConfirmId('')
  }

  function openRoundPreview(roundId) {
    setPreviewRoundId(String(roundId || '').trim())
    setPreviewSearch('')
    setRoundClearConfirmId('')
  }

  function reorderRound(fromRoundId, toRoundId) {
    const fromId = String(fromRoundId || '').trim()
    const toId = String(toRoundId || '').trim()
    if (!fromId || !toId || fromId === toId) return
    setRoundOrder((prev) => {
      const fromIndex = prev.indexOf(fromId)
      const toIndex = prev.indexOf(toId)
      if (fromIndex < 0 || toIndex < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
    setRoundClearConfirmId('')
  }

  function handleRoundDragStart(event, roundId) {
    const id = String(roundId || '').trim()
    if (!id) return
    setDragRoundId(id)
    dragPointerYRef.current = Number(event.clientY)
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }

  function handleRoundDragOver(event, roundId) {
    if (!dragRoundId) return
    event.preventDefault()
    dragPointerYRef.current = Number(event.clientY)
    const targetId = String(roundId || '').trim()
    if (!targetId || targetId === dragRoundId) return
    setRoundOrder((prev) => {
      const fromIndex = prev.indexOf(dragRoundId)
      const toIndex = prev.indexOf(targetId)
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  function handleRoundDrop(event, roundId) {
    event.preventDefault()
    dragPointerYRef.current = null
    const targetId = String(roundId || '').trim()
    const fromData = String(event.dataTransfer.getData('text/plain') || '').trim()
    const sourceId = String(dragRoundId || fromData || '').trim()
    if (sourceId && targetId && sourceId !== targetId) reorderRound(sourceId, targetId)
    setDragRoundId('')
  }

  function handleRoundDragEnd() {
    dragPointerYRef.current = null
    setDragRoundId('')
  }

  function closeRoundPreview() {
    setPreviewRoundId('')
    setPreviewSearch('')
    setRoundClearConfirmId('')
    setSaveSuccess((prev) => (prev.roundId ? { roundId: '', text: '' } : prev))
  }

  function toggleQuestion(questionId) {
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev)
      if (next.has(questionId)) next.delete(questionId)
      else next.add(questionId)
      return next
    })
    setRoundClearConfirmId('')
    setError('')
  }

  function handleResetDefault() {
    const defaultCatalog = buildPlanCatalog(builtinRounds)
    const defaults = defaultPlanIds(defaultCatalog)
    setSelectedQuestionIds(buildInitialSelection(defaults, builtinRounds))
    setRoundOrder(combinedCatalog.map((round) => round.id))
    setRoundClearConfirmId('')
    setRecentlyClearedRound(null)
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
    const defaultQuestions = [cloneJson(DEFAULT_QUESTION)]
    setCreatorMode('create')
    setEditingRoundId('')
    setEditingTemplateId('')
    setNewTemplateName('')
    setNewTemplateIntro('')
    setNewTemplateRules([])
    setNewTemplateScoring(cloneJson(DEFAULT_SCORING))
    setNewTemplateQuestions(defaultQuestions)
    setEditorBaseline(buildEditorSnapshot({
      name: '',
      intro: '',
      rules: [],
      scoring: cloneJson(DEFAULT_SCORING),
      questions: defaultQuestions,
    }))
    setCreateError('')
  }

  function closeCreator(options = {}) {
    if (!options.skipConfirm && isEditorDirty && typeof window !== 'undefined') {
      const confirmed = window.confirm('Discard unsaved changes?')
      if (!confirmed) return
    }
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
    const editQuestions = (
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
    setNewTemplateQuestions(editQuestions)
    setEditorBaseline(buildEditorSnapshot({
      name: String(round.name || '').trim(),
      intro: String(round.intro || '').trim(),
      rules: Array.isArray(round.rules) ? cloneJson(round.rules) : [],
      scoring: Array.isArray(round.scoring) ? cloneJson(round.scoring) : cloneJson(DEFAULT_SCORING),
      questions: editQuestions,
    }))
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
      closeCreator({ skipConfirm: true })
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
    closeCreator({ skipConfirm: true })
  }

  const inlineValidationError = showCreator ? validateTemplate() : null
  const canSubmitCreator = !createSubmitting && isEditorDirty && !inlineValidationError

  if (!templatesBootstrapped) {
    return (
      <div className="setup-container">
        <div className="setup-step game-config-step game-config-loading-step">
          <div className="setup-icon">🧭</div>
          <h2 className="setup-heading">Loading Rounds</h2>
          <p className="setup-sub">Fetching custom rounds from the template library…</p>
          <div className="game-config-loading-pulse" aria-hidden="true" />
        </div>
      </div>
    )
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
          {roundRows.map(({ round, roundIndex, displayIndex, questionIds, selectedCount, allSelected, noneSelected }) => (
            <div
              key={round.id}
              className={`game-config-round-card type-${round.type}${noneSelected ? ' off' : ''}${dragRoundId === round.id ? ' is-dragging' : ''}`}
              onDragOver={(e) => handleRoundDragOver(e, round.id)}
              onDrop={(e) => handleRoundDrop(e, round.id)}
            >
              <div className="game-config-round-head">
                <div className="game-config-round-title-wrap">
                  <span className="game-config-round-pill">
                    {`ROUND ${displayIndex}`}
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
                    className="game-config-round-drag-handle"
                    draggable
                    onDragStart={(e) => handleRoundDragStart(e, round.id)}
                    onDragEnd={handleRoundDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleRoundDrop(e, round.id)}
                    aria-label={`Drag to reorder ${round.name}`}
                    title="Drag to reorder"
                  >
                    ⋮⋮ Drag
                  </button>
                  <button
                    type="button"
                    className="game-config-round-preview-btn"
                    onClick={() => openRoundPreview(round.id)}
                  >
                    Preview
                  </button>
                  <button
                    type="button"
                    className={`game-config-round-action${allSelected && roundClearConfirmId === round.id ? ' confirm-clear' : ''}`}
                    onClick={() => handleRoundToggle({ round, roundIndex, questionIds, allSelected })}
                  >
                    {allSelected
                      ? (roundClearConfirmId === round.id ? 'Confirm Clear' : 'Clear Round')
                      : 'Select Round'}
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

        {recentlyClearedRound && (
          <div className="game-config-undo-banner">
            <span>{recentlyClearedRound.roundName} cleared.</span>
            <button type="button" onClick={handleUndoClearRound}>Undo</button>
          </div>
        )}

        {error && <p className="session-gate-error">{error}</p>}

        <div className="setup-actions">
          <button type="button" className="back-btn" onClick={onBack}>← Back</button>
          <button type="button" className="back-btn" onClick={handleResetDefault}>Default</button>
          <button type="button" className="start-btn" onClick={handleContinue} disabled={selectedQuestions === 0}>
            Continue →
          </button>
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
                {`Round ${previewRow.displayIndex}`}
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
                  className={`game-config-round-action${previewRow.allSelected && roundClearConfirmId === previewRow.round.id ? ' confirm-clear' : ''}`}
                  onClick={() => handleRoundToggle(previewRow)}
                >
                  {previewRow.allSelected
                    ? (roundClearConfirmId === previewRow.round.id ? 'Confirm Clear' : 'Clear Round')
                    : 'Select Round'}
                </button>
              </div>
              <div className="game-config-preview-search-row">
                <input
                  type="text"
                  className="team-name-input game-config-preview-search-input"
                  value={previewSearch}
                  onChange={(e) => setPreviewSearch(e.target.value)}
                  placeholder="Search by question, answer, clue, or tag"
                />
                {previewSearchNormalized && (
                  <button
                    type="button"
                    className="game-config-preview-search-clear"
                    onClick={() => setPreviewSearch('')}
                  >
                    Clear
                  </button>
                )}
                {previewMatchesLabel && (
                  <span className="game-config-preview-search-count">{previewMatchesLabel}</span>
                )}
              </div>
            </div>

            <div className="game-config-preview-list">
              {previewItems.length === 0 && previewSearchNormalized && (
                <div className="game-config-preview-empty">
                  No matches for "{previewSearch.trim()}". Try a broader term.
                </div>
              )}
              {previewItems.map((item) => {
                const {
                  key,
                  question,
                  questionId,
                  questionIndex,
                  selected,
                  headline,
                  detail,
                  tags,
                  answer,
                } = item
                return (
                  <div
                    key={key}
                    className={`game-config-preview-question${selected ? ' selected' : ''}`}
                  >
                    <div className="game-config-preview-question-head">
                      <span className="game-config-preview-q-index">Q{questionIndex + 1}</span>
                      <button
                        type="button"
                        className={`game-config-preview-q-state${selected ? ' selected' : ''}`}
                        aria-pressed={selected}
                        aria-label={selected ? `Unselect question ${questionIndex + 1}` : `Select question ${questionIndex + 1}`}
                        title={selected ? 'Selected' : 'Not selected'}
                        onClick={() => {
                          if (!questionId) return
                          toggleQuestion(questionId)
                        }}
                      >
                        <span className="game-config-preview-q-state-check" aria-hidden="true">
                          {selected ? '✓' : ''}
                        </span>
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
              <div className={`game-config-template-dirty${isEditorDirty ? ' dirty' : ''}`}>
                {isEditorDirty ? 'Unsaved changes' : 'No unsaved changes'}
              </div>
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
            {!createError && inlineValidationError && isEditorDirty && (
              <p className="game-config-template-hint">Fix before saving: {inlineValidationError}</p>
            )}

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
                disabled={!canSubmitCreator}
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
