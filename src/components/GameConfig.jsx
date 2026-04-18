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
import RoundCard from './game-config/RoundCard'
import TemplateEditorModal from './game-config/TemplateEditorModal'
import { useRoundOrder } from './game-config/useRoundOrder'
import { useTemplateLibrary } from './game-config/useTemplateLibrary'

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
    templatesLoading,
    templatesBootstrapped,
    templatesError,
  } = useTemplateLibrary({ session, initialCatalog })

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
          {roundRows.map((row, index) => (
            <RoundCard
              key={row.round.id}
              row={row}
              roundClearConfirmId={roundClearConfirmId}
              sessionEditedRoundIds={sessionEditedRoundIds}
              selectedQuestionIds={selectedQuestionIds}
              canMoveUp={index > 0}
              canMoveDown={index < roundRows.length - 1}
              onMoveUp={() => moveRound(row.round.id, -1)}
              onMoveDown={() => moveRound(row.round.id, 1)}
              onOpenPreview={openRoundPreview}
              onToggleRound={handleRoundToggle}
              onToggleQuestion={toggleQuestion}
            />
          ))}
        </div>

        {recentlyClearedRound && (
          <div className="game-config-undo-banner">
            <span>{recentlyClearedRound.roundName} cleared.</span>
            <button type="button" onClick={handleUndoClearRound}>Undo</button>
          </div>
        )}

        {error && <p className="session-gate-error">{error}</p>}

        <div className="setup-actions game-config-footer-actions">
          <button type="button" className="back-btn" onClick={onBack}>← Back</button>
          <button type="button" className="back-btn" onClick={handleResetDefault}>Default</button>
          <button type="button" className="start-btn" onClick={handleContinue} disabled={selectedQuestions === 0}>
            Continue →
          </button>
        </div>
      </div>

      {previewRow && (
        <PreviewModal
          previewRow={previewRow}
          saveSuccess={saveSuccess}
          roundClearConfirmId={roundClearConfirmId}
          previewSearch={previewSearch}
          setPreviewSearch={setPreviewSearch}
          previewSearchNormalized={previewSearchNormalized}
          previewMatchesLabel={previewMatchesLabel}
          previewItems={previewItems}
          onClose={closeRoundPreview}
          onEditRound={openEditRoundModal}
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
    </div>
  )
}
