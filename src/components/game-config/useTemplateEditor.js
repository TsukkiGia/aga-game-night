import { useMemo, useState } from 'react'
import {
  CUSTOM_ROUND_TYPE,
  normalizeRoundCatalog,
  templateToRound,
} from '../../roundCatalog'
import { mediaUrlFeedback } from '../../utils/mediaPrompt'
import { DEFAULT_QUESTION, DEFAULT_SCORING } from './constants'
import { buildEditorSnapshot, cloneJson } from './helpers'

export function useTemplateEditor({
  session,
  roundRows,
  builtinQuestionIdsByRoundId,
  setCustomTemplates,
  onClearRoundConfirm,
  onReturnToPreview,
}) {
  const [showCreator, setShowCreator] = useState(false)
  const [creatorMode, setCreatorMode] = useState('create')
  const [editingRoundId, setEditingRoundId] = useState('')
  const [editingTemplateId, setEditingTemplateId] = useState('')
  const [createError, setCreateError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState({ roundId: '', text: '' })
  const [editorBaseline, setEditorBaseline] = useState(() => buildEditorSnapshot({
    name: '',
    intro: '',
    rules: [],
    scoring: cloneJson(DEFAULT_SCORING),
    questions: [cloneJson(DEFAULT_QUESTION)],
  }))
  const [createSubmitting, setCreateSubmitting] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateIntro, setNewTemplateIntro] = useState('')
  const [newTemplateRules, setNewTemplateRules] = useState([])
  const [newTemplateScoring, setNewTemplateScoring] = useState(() => cloneJson(DEFAULT_SCORING))
  const [newTemplateQuestions, setNewTemplateQuestions] = useState(() => [cloneJson(DEFAULT_QUESTION)])
  const [protectedQuestionIds, setProtectedQuestionIds] = useState(() => new Set())

  const currentEditorSnapshot = useMemo(() => buildEditorSnapshot({
    name: newTemplateName,
    intro: newTemplateIntro,
    rules: newTemplateRules,
    scoring: newTemplateScoring,
    questions: newTemplateQuestions,
  }), [newTemplateName, newTemplateIntro, newTemplateRules, newTemplateScoring, newTemplateQuestions])

  const isEditorDirty = showCreator && currentEditorSnapshot !== editorBaseline

  function nextQuestionId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `cq-${crypto.randomUUID()}`
    return `cq-${Date.now()}-${Math.floor(Math.random() * 100000)}`
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
    setProtectedQuestionIds(new Set())
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
    const roundIdAtClose = String(editingRoundId || '').trim()
    const shouldReturnToPreview = options.returnToPreview ?? false
    setShowCreator(false)
    resetCreator()
    if (shouldReturnToPreview && roundIdAtClose) onReturnToPreview(roundIdAtClose)
  }

  function openCreateTemplateModal() {
    resetCreator()
    setCreatorMode('create')
    setShowCreator(true)
  }

  function openSessionRoundEditor(roundId) {
    const id = String(roundId || '').trim()
    if (!id) return
    const row = roundRows.find((item) => item.round.id === id)
    if (!row) return
    const round = row.round
    if (String(round?.type || '').trim().toLowerCase() !== CUSTOM_ROUND_TYPE) return

    const nextRules = Array.isArray(round.rules) ? cloneJson(round.rules) : []
    const nextScoring = (round.scoring && typeof round.scoring === 'object' && !Array.isArray(round.scoring))
      ? cloneJson(round.scoring)
      : cloneJson(DEFAULT_SCORING)
    const questionsSource = Array.isArray(round.questions) && round.questions.length > 0
      ? round.questions
      : [cloneJson(DEFAULT_QUESTION)]
    const nextQuestions = questionsSource.map((question, index) => {
      const base = cloneJson(DEFAULT_QUESTION)
      const merged = { ...base, ...(cloneJson(question || {})) }
      return {
        ...merged,
        id: String(merged?.id || '').trim() || `${id}-q${index + 1}`,
      }
    })
    const builtinIds = builtinQuestionIdsByRoundId?.get?.(id) || new Set()
    const nextProtectedIds = new Set(
      nextQuestions
        .map((question) => String(question?.id || '').trim())
        .filter((questionId) => builtinIds.has(questionId))
    )

    setCreatorMode('session-edit')
    setEditingRoundId(id)
    setEditingTemplateId(String(round.templateId || '').trim())
    setNewTemplateName(String(round.name || '').trim())
    setNewTemplateIntro(String(round.intro || '').trim())
    setNewTemplateRules(nextRules)
    setNewTemplateScoring(nextScoring)
    setNewTemplateQuestions(nextQuestions)
    setProtectedQuestionIds(nextProtectedIds)
    setEditorBaseline(buildEditorSnapshot({
      name: String(round.name || '').trim(),
      intro: String(round.intro || '').trim(),
      rules: nextRules,
      scoring: nextScoring,
      questions: nextQuestions,
    }))
    setCreateError('')
    onClearRoundConfirm()
    setShowCreator(true)
  }

  function validateTemplate() {
    if (!newTemplateName.trim()) return 'Round name is required.'
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
      scoring: newTemplateScoring,
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
      scoring: newTemplateScoring,
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
      return [normalized, ...prev]
    })
    setSaveSuccess({ roundId, text: 'Saved. Preview updated for this session.' })
    closeCreator({ skipConfirm: true })
  }

  function clearSaveSuccess() {
    setSaveSuccess((prev) => (prev.roundId ? { roundId: '', text: '' } : prev))
  }

  const inlineValidationError = showCreator ? validateTemplate() : null
  const canSubmitCreator = !createSubmitting && isEditorDirty && !inlineValidationError

  return {
    showCreator,
    creatorMode,
    newTemplateName,
    setNewTemplateName,
    newTemplateIntro,
    setNewTemplateIntro,
    newTemplateRules,
    setNewTemplateRules,
    newTemplateScoring,
    setNewTemplateScoring,
    newTemplateQuestions,
    setNewTemplateQuestions,
    protectedQuestionIds,
    createError,
    createSubmitting,
    saveSuccess,
    isEditorDirty,
    inlineValidationError,
    canSubmitCreator,
    openCreateTemplateModal,
    openSessionRoundEditor,
    closeCreator,
    handleCreateTemplate,
    handleSaveSessionRoundEdits,
    clearSaveSuccess,
    nextQuestionId,
  }
}
