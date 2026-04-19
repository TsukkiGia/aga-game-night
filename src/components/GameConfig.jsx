import { useEffect, useMemo, useState } from 'react'
import rounds from '../rounds'
import { buildPlanCatalog, defaultPlanIds } from '../gamePlan'
import {
  CUSTOM_ROUND_TYPE,
  normalizeRoundCatalog,
  templateToRound,
} from '../roundCatalog'
import { mediaUrlFeedback } from '../utils/mediaPrompt'
import { DEFAULT_QUESTION, DEFAULT_SCORING } from './game-config/constants'
import {
  buildEditorSnapshot,
  buildInitialSelection,
  cloneJson,
  questionPreviewAnswer,
  questionPreviewDetail,
  questionPreviewHeadline,
  questionPreviewTags,
} from './game-config/helpers'
import PreviewModal from './game-config/PreviewModal'
import TemplateEditorModal from './game-config/TemplateEditorModal'
import { useRoundOrder } from './game-config/useRoundOrder'
import { useTemplateLibrary } from './game-config/useTemplateLibrary'

const TYPE_LABEL = {
  video: 'Video',
  slang: 'Slang',
  charades: 'Charades',
  thesis: 'Thesis',
  'custom-buzz': 'Buzz',
}

const TYPE_THUMB = {
  video: '▶',
  charades: 'ACT',
  slang: 'SLG',
  thesis: 'TXT',
  'custom-buzz': 'BZZ',
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

  const {
    customTemplates,
    setCustomTemplates,
    templatesBootstrapped,
    templatesError,
  } = useTemplateLibrary({ session, initialCatalog })

  const [showCreator, setShowCreator] = useState(false)
  const [previewRoundId, setPreviewRoundId] = useState('')
  const [previewSearch, setPreviewSearch] = useState('')
  const [creatorMode, setCreatorMode] = useState('create')
  const [editingRoundId, setEditingRoundId] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState('')
  const [, setSessionEditedRoundIds] = useState(() => new Set())
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

  // New split-panel state
  const [activeRoundId, setActiveRoundId] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [questionSearch, setQuestionSearch] = useState('')

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
    customTemplates.forEach((round) => byId.set(round.id, round))
    return [...byId.values()]
  }, [builtinRounds, customTemplates])

  const {
    setRoundOrder,
    orderedCatalog,
  } = useRoundOrder(combinedCatalog)

  const PLAN_CATALOG = useMemo(() => buildPlanCatalog(orderedCatalog), [orderedCatalog])
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(() =>
    buildInitialSelection(initialPlanIds, initialCatalog)
  )
  const [error, setError] = useState('')

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

  // Default activeRoundId to first round once available
  useEffect(() => {
    if (!activeRoundId && roundRows.length > 0) {
      setActiveRoundId(roundRows[0].round.id)
    }
  }, [roundRows, activeRoundId])

  const activeRow = useMemo(
    () => roundRows.find((row) => row.round.id === activeRoundId) || roundRows[0] || null,
    [roundRows, activeRoundId]
  )

  const activeQuestions = useMemo(() => {
    if (!activeRow) return []
    const search = questionSearch.trim().toLowerCase()
    return activeRow.round.questions.map((question, questionIndex) => {
      const questionId = activeRow.questionIds[questionIndex]
      const selected = Boolean(questionId) && selectedQuestionIds.has(questionId)
      const headline = questionPreviewHeadline(activeRow.round, question, questionIndex)
      const tags = questionPreviewTags(activeRow.round, question)
      const answer = questionPreviewAnswer(activeRow.round, question)
      const detail = questionPreviewDetail(activeRow.round, question)
      const searchable = [headline, answer, detail, ...tags, `q${questionIndex + 1}`].join(' ').toLowerCase()
      return { question, questionIndex, questionId, selected, headline, tags, answer, detail, searchable }
    }).filter(item => !search || item.searchable.includes(search))
  }, [activeRow, questionSearch, selectedQuestionIds])

  const totalQuestions = useMemo(
    () => roundRows.reduce((sum, row) => sum + row.questionIds.length, 0),
    [roundRows]
  )

  const selectedQuestions = useMemo(
    () => roundRows.reduce((sum, row) => sum + row.selectedCount, 0),
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
          `q${questionIndex + 1}`, headline, detail, answer, ...tags,
          question?.promptText, question?.mediaUrl, question?.explanation,
          question?.answer, question?.term, question?.meaning, question?.sentence,
          question?.phrase, question?.title,
          Array.isArray(question?.options) ? question.options.join(' ') : '',
          Array.isArray(question?.countries) ? question.countries.join(' ') : '',
        ].map((value) => String(value || '').toLowerCase()).join(' ')
        return {
          key: questionId || `${previewRow.round.id}-q${questionIndex + 1}`,
          question, questionIndex, questionId, selected, headline, detail, tags, answer, searchable,
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
      setRecentlyClearedRound({ roundId: round.id, roundName: round.name, questionIds: clearedQuestionIds })
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
      ids.forEach((id) => { if (PLAN_CATALOG.byId.has(id)) next.add(id) })
      return next
    })
    setRecentlyClearedRound(null)
    setRoundClearConfirmId('')
  }

  function handleSelectAllActive() {
    if (!activeRow) return
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev)
      activeRow.questionIds.forEach((id) => next.add(id))
      return next
    })
    setRoundClearConfirmId('')
    setError('')
  }

  function handleClearActive() {
    if (!activeRow) return
    setSelectedQuestionIds((prev) => {
      const next = new Set(prev)
      activeRow.questionIds.forEach((id) => next.delete(id))
      return next
    })
    setRoundClearConfirmId('')
  }

  function openRoundPreview(roundId) {
    setPreviewRoundId(String(roundId || '').trim())
    setPreviewSearch('')
    setRoundClearConfirmId('')
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

  function moveRound(roundId, delta) {
    const id = String(roundId || '').trim()
    if (!id || !Number.isInteger(delta) || delta === 0) return
    const ids = orderedCatalog.map((round) => round.id)
    const from = ids.indexOf(id)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return
    const next = [...ids]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setRoundOrder(next)
    setRoundClearConfirmId('')
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
    onConfirm({ planIds: nextPlanIds, roundCatalog: snapshotRounds })
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
      name: '', intro: '', rules: [], scoring: cloneJson(DEFAULT_SCORING), questions: defaultQuestions,
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
    if (validationError) { setCreateError(validationError); return }
    if (!session?.code || !session?.pin) { setCreateError('Session credentials are required.'); return }
    const payload = {
      name: newTemplateName, intro: newTemplateIntro, type: CUSTOM_ROUND_TYPE,
      rules: newTemplateRules.map((rule) => String(rule || '').trim()).filter(Boolean),
      scoring: newTemplateScoring.map((row) => ({ label: row.label, points: Number(row.points), phase: row.phase })),
      questions: newTemplateQuestions.map((question) => ({
        id: question.id, promptType: question.promptType, promptText: question.promptText,
        mediaUrl: question.mediaUrl, answer: question.answer, explanation: question.explanation,
      })),
    }
    setCreateSubmitting(true)
    setCreateError('')
    try {
      const res = await fetch('/api/round-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-session-code': session.code, 'x-host-pin': session.pin },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.template) {
        setCreateError(data.error === 'invalid-template' ? 'Template is incomplete or invalid.' : 'Could not create template.')
        return
      }
      const normalized = templateToRound(data.template)
      if (!normalized) { setCreateError('Template was saved but could not be loaded.'); return }
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
    if (validationError) { setCreateError(validationError); return }
    const roundId = String(editingRoundId || '').trim()
    if (!roundId) { setCreateError('Could not find the selected round to edit.'); return }
    const normalized = normalizeRoundCatalog([{
      id: roundId, templateId: editingTemplateId || undefined,
      name: newTemplateName, intro: newTemplateIntro, type: CUSTOM_ROUND_TYPE,
      rules: newTemplateRules.map((rule) => String(rule || '').trim()).filter(Boolean),
      scoring: newTemplateScoring.map((row) => ({ label: row.label, points: Number(row.points), phase: row.phase })),
      questions: newTemplateQuestions.map((question, index) => ({
        id: String(question?.id || '').trim() || `cq-${index + 1}`,
        promptType: question.promptType, promptText: question.promptText,
        mediaUrl: question.mediaUrl, answer: question.answer, explanation: question.explanation,
      })),
    }])[0]
    if (!normalized) { setCreateError('Round is incomplete or invalid.'); return }
    setCustomTemplates((prev) => {
      const index = prev.findIndex((round) => round.id === roundId)
      if (index >= 0) return prev.map((round) => (round.id === roundId ? normalized : round))
      return [normalized, ...prev]
    })
    setSessionEditedRoundIds((prev) => { const next = new Set(prev); next.add(roundId); return next })
    setSaveSuccess({ roundId, text: 'Saved. Preview updated for this session.' })
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

  const activeRoundsCount = roundRows.filter((row) => !row.noneSelected).length

  return (
    <>
      <div className="gc2-wrap">
        {/* ── LEFT SIDEBAR ── */}
        <aside className="gc2-sidebar">
          <div className="gc2-sidebar-head">
            <div className="gc2-sidebar-label">Step 2 · Game Plan</div>
            <h2 className="gc2-sidebar-title">Build your run of show</h2>
            <div className="gc2-stats">
              <div className="gc2-stat">
                <span className="gc2-stat-label">Selected</span>
                <span className="gc2-stat-value">{selectedQuestions}</span>
                <span className="gc2-stat-total"> / {totalQuestions}</span>
              </div>
              <div className="gc2-stat">
                <span className="gc2-stat-label">Rounds Active</span>
                <span className="gc2-stat-value">{activeRoundsCount}</span>
                <span className="gc2-stat-total"> / {roundRows.length}</span>
              </div>
            </div>
          </div>

          <div className="gc2-round-list">
            {roundRows.map((row, index) => {
              const isActive = activeRow?.round.id === row.round.id
              const pct = row.questionIds.length > 0
                ? Math.round((row.selectedCount / row.questionIds.length) * 100)
                : 0
              return (
                <button
                  key={row.round.id}
                  type="button"
                  className={`gc2-round-item${isActive ? ' active' : ''}`}
                  style={{ '--round-color': `var(--gc2-r${(index % 8) + 1})` }}
                  onClick={() => { setActiveRoundId(row.round.id); setQuestionSearch('') }}
                >
                  <div className="gc2-round-item-top">
                    <div className="gc2-round-item-meta">
                      <span className="gc2-round-dot" />
                      <span className="gc2-round-item-number">Round {row.displayIndex}</span>
                    </div>
                    <div className="gc2-round-item-right">
                      {!row.noneSelected && (
                        <span className="gc2-round-item-count">{row.selectedCount} / {row.questionIds.length}</span>
                      )}
                      {isActive && (
                        <div className="gc2-round-item-controls">
                          <button type="button" className="gc2-move-btn" onClick={(e) => { e.stopPropagation(); moveRound(row.round.id, -1) }} disabled={index === 0} title="Move up">↑</button>
                          <button type="button" className="gc2-move-btn" onClick={(e) => { e.stopPropagation(); moveRound(row.round.id, 1) }} disabled={index === roundRows.length - 1} title="Move down">↓</button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="gc2-round-item-name">{row.round.name}</div>
                  <div className="gc2-round-progress">
                    <div className="gc2-round-progress-fill" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              )
            })}

            <button type="button" className="gc2-new-round-btn" onClick={openCreateTemplateModal}>
              + New Custom Round
            </button>
          </div>

          <div className="gc2-sidebar-footer">
            <button type="button" className="gc2-footer-btn gc2-footer-back" onClick={onBack}>← Back</button>
            <button type="button" className="gc2-footer-btn gc2-footer-reset" onClick={handleResetDefault}>Default</button>
            <button type="button" className="gc2-footer-btn gc2-footer-continue" onClick={handleContinue} disabled={selectedQuestions === 0}>
              Continue →
            </button>
          </div>
        </aside>

        {/* ── RIGHT MAIN ── */}
        <main className="gc2-main">
          {activeRow && (
            <>
              <div className="gc2-main-header">
                <div className="gc2-main-header-left">
                  <span className={`gc2-main-pill type-${activeRow.round.type}`}>
                    Round {activeRow.displayIndex}
                  </span>
                  <h2 className="gc2-main-title">{activeRow.round.name}</h2>
                  {activeRow.round.intro && (
                    <p className="gc2-main-intro">{activeRow.round.intro}</p>
                  )}
                </div>
                <button
                  type="button"
                  className="gc2-full-preview-btn"
                  onClick={() => openRoundPreview(activeRow.round.id)}
                >
                  Round preview →
                </button>
              </div>

              <div className="gc2-toolbar">
                <input
                  type="text"
                  className="gc2-search"
                  value={questionSearch}
                  onChange={(e) => setQuestionSearch(e.target.value)}
                  placeholder={`Search ${activeRow.questionIds.length} questions by prompt, answer, or tag`}
                />
                <div className="gc2-view-toggle">
                  <button
                    type="button"
                    className={`gc2-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                    onClick={() => setViewMode('grid')}
                  >Grid</button>
                  <button
                    type="button"
                    className={`gc2-view-btn${viewMode === 'list' ? ' active' : ''}`}
                    onClick={() => setViewMode('list')}
                  >List</button>
                </div>
                <button type="button" className="gc2-toolbar-btn" onClick={handleSelectAllActive}>
                  Select all
                </button>
                <button type="button" className="gc2-toolbar-btn" onClick={handleClearActive}>
                  Clear
                </button>
              </div>

              {recentlyClearedRound && (
                <div className="gc2-undo-bar">
                  <span>{recentlyClearedRound.roundName} cleared.</span>
                  <button type="button" onClick={handleUndoClearRound}>Undo</button>
                </div>
              )}
              {error && <p className="gc2-error">{error}</p>}
              {templatesError && <p className="gc2-error">{templatesError}</p>}

              <div className="gc2-question-scroll">
                {activeQuestions.length === 0 && questionSearch && (
                  <div className="gc2-empty">No matches for "{questionSearch.trim()}".</div>
                )}
                {viewMode === 'list' ? (
                  <div className="gc2-question-list">
                    {activeQuestions.map(({ questionIndex, questionId, selected, headline, tags, answer, detail }) => {
                      const subtitle = [answer || detail, tags[0]].filter(Boolean).join(' · ')
                      return (
                        <button
                          key={questionId || `${activeRow.round.id}-q${questionIndex + 1}`}
                          type="button"
                          aria-pressed={selected}
                          className={`gc2-list-row${selected ? ' selected' : ''}`}
                          onClick={() => { if (questionId) toggleQuestion(questionId) }}
                        >
                          <span className={`gc2-list-sel${selected ? ' selected' : ''}`}>
                            {selected ? '✓' : ''}
                          </span>
                          <div className={`gc2-list-thumb${activeRow.round.type === 'video' ? ' is-video' : ''}`} aria-hidden="true">
                            {TYPE_THUMB[activeRow.round.type] || 'Q'}
                          </div>
                          <div className="gc2-list-content">
                            <div className="gc2-list-title">
                              <span className="gc2-list-q-num">Q{questionIndex + 1}</span>
                              {headline}
                            </div>
                            {subtitle && <div className="gc2-list-sub">{subtitle}</div>}
                          </div>
                          <div className="gc2-list-tags">
                            {tags.slice(1).map((tag, i) => (
                              <span key={i} className="gc2-list-tag">{tag}</span>
                            ))}
                            {tags[0] && <span className="gc2-list-tag">{tags[0]}</span>}
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className="gc2-question-grid">
                    {activeQuestions.map(({ questionIndex, questionId, selected, headline, answer }) => {
                      const hasAnswer = answer && activeRow.round.type !== 'charades' && activeRow.round.type !== 'thesis'
                      return (
                        <button
                          key={questionId || `${activeRow.round.id}-q${questionIndex + 1}`}
                          type="button"
                          aria-pressed={selected}
                          className={`gc2-q-card${selected ? ' selected' : ''}`}
                          onClick={() => { if (questionId) toggleQuestion(questionId) }}
                        >
                          <div className="gc2-q-label">
                            <span>Q{questionIndex + 1} · {TYPE_LABEL[activeRow.round.type] || 'Q'}</span>
                            <span className="gc2-q-check" aria-hidden="true">{selected ? '✓' : ''}</span>
                          </div>
                          <div className="gc2-q-title">{headline}</div>
                          {hasAnswer && <div className="gc2-q-answer">{answer}</div>}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {previewRow && (
        <PreviewModal
          previewRow={previewRow}
          saveSuccess={saveSuccess}
          previewSearch={previewSearch}
          setPreviewSearch={setPreviewSearch}
          previewSearchNormalized={previewSearchNormalized}
          previewMatchesLabel={previewMatchesLabel}
          previewItems={previewItems}
          onClose={closeRoundPreview}
          onToggleRound={handleRoundToggle}
          onToggleQuestion={toggleQuestion}
        />
      )}

      {showCreator && (
        <TemplateEditorModal
          creatorMode={creatorMode}
          isEditorDirty={isEditorDirty}
          newTemplateName={newTemplateName}
          setNewTemplateName={setNewTemplateName}
          newTemplateIntro={newTemplateIntro}
          setNewTemplateIntro={setNewTemplateIntro}
          newTemplateRules={newTemplateRules}
          setNewTemplateRules={setNewTemplateRules}
          newTemplateScoring={newTemplateScoring}
          setNewTemplateScoring={setNewTemplateScoring}
          newTemplateQuestions={newTemplateQuestions}
          setNewTemplateQuestions={setNewTemplateQuestions}
          createError={createError}
          inlineValidationError={inlineValidationError}
          canSubmitCreator={canSubmitCreator}
          createSubmitting={createSubmitting}
          onCloseCreator={closeCreator}
          onSaveSessionRoundEdits={handleSaveSessionRoundEdits}
          onCreateTemplate={handleCreateTemplate}
          nextQuestionId={nextQuestionId}
        />
      )}
    </>
  )
}
