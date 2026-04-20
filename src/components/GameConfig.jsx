import { useEffect, useMemo, useRef, useState } from 'react'
import rounds from '../rounds'
import { buildPlanCatalog } from '../gamePlan'
import {
  isCustomTemplateRound,
  normalizeRoundCatalog,
} from '../roundCatalog'
import {
  buildSnapshotPayloadFromSelection,
  buildHealthyDefaultSelection,
  buildInitialSelection,
  questionPreviewAnswer,
  questionPreviewDetail,
  questionPreviewHeadline,
  questionPreviewTags,
} from './game-config/helpers'
import PreviewModal from './game-config/PreviewModal'
import TemplateEditorModal from './game-config/TemplateEditorModal'
import BrowseTemplatesModal from './game-config/BrowseTemplatesModal'
import RoundSidebar from './game-config/RoundSidebar'
import GameConfigMainPanel from './game-config/GameConfigMainPanel'
import { useRoundOrder } from './game-config/useRoundOrder'
import { useTemplateLibrary } from './game-config/useTemplateLibrary'
import { useTemplateEditor } from './game-config/useTemplateEditor'

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

  const [showBrowseTemplates, setShowBrowseTemplates] = useState(false)
  const [browseSearch, setBrowseSearch] = useState('')
  const [previewRoundId, setPreviewRoundId] = useState('')
  const [previewSearch, setPreviewSearch] = useState('')
  const [communityPreviewRoundId, setCommunityPreviewRoundId] = useState('')
  const [communityPreviewSearch, setCommunityPreviewSearch] = useState('')
  const [roundClearConfirmId, setRoundClearConfirmId] = useState('')
  const [recentlyClearedRound, setRecentlyClearedRound] = useState(null)
  const [addedCustomRoundIds, setAddedCustomRoundIds] = useState(() => {
    const initial = new Set()
    initialCatalog
      .filter((round) => isCustomTemplateRound(round))
      .forEach((round) => initial.add(round.id))
    return initial
  })

  // New split-panel state
  const [activeRoundId, setActiveRoundId] = useState('')
  const [viewMode, setViewMode] = useState('grid')
  const [questionSearch, setQuestionSearch] = useState('')
  const roundListRef = useRef(null)
  const questionScrollRef = useRef(null)
  const roundListScrollTopRef = useRef(0)
  const questionScrollByRoundRef = useRef(new Map())

  const combinedCatalog = useMemo(() => {
    const byId = new Map()
    builtinRounds.forEach((round) => byId.set(round.id, round))
    customTemplates
      .filter((round) => addedCustomRoundIds.has(round.id))
      .forEach((round) => byId.set(round.id, round))
    return [...byId.values()]
  }, [builtinRounds, customTemplates, addedCustomRoundIds])

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
        orderIndex: roundIndex,
        displayIndex: roundIndex + 1,
        questionIds,
        selectedCount,
        allSelected: selectedCount === questionIds.length,
        noneSelected: selectedCount === 0,
      }
    })
  }, [orderedCatalog, PLAN_CATALOG, selectedQuestionIds])

  const resolvedActiveRoundId = useMemo(() => {
    if (roundRows.length === 0) return ''
    const stillExists = roundRows.some((row) => row.round.id === activeRoundId)
    if (stillExists) return activeRoundId
    return roundRows[0].round.id
  }, [roundRows, activeRoundId])

  useEffect(() => {
    if (!resolvedActiveRoundId) return undefined
    const restore = () => {
      if (roundListRef.current) {
        roundListRef.current.scrollTop = roundListScrollTopRef.current
      }
      if (questionScrollRef.current) {
        const savedTop = questionScrollByRoundRef.current.get(resolvedActiveRoundId)
        questionScrollRef.current.scrollTop = Number.isFinite(savedTop) ? savedTop : 0
      }
    }
    const rafId = requestAnimationFrame(restore)
    return () => cancelAnimationFrame(rafId)
  }, [resolvedActiveRoundId])

  const activeRow = useMemo(
    () => roundRows.find((row) => row.round.id === resolvedActiveRoundId) || roundRows[0] || null,
    [roundRows, resolvedActiveRoundId]
  )

  const {
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
  } = useTemplateEditor({
    session,
    roundRows,
    setCustomTemplates,
    onClearRoundConfirm: () => setRoundClearConfirmId(''),
    onReturnToPreview: setPreviewRoundId,
  })

  useEffect(() => {
    if ((!showCreator && !previewRoundId && !showBrowseTemplates && !communityPreviewRoundId) || typeof document === 'undefined') return undefined
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
  }, [showCreator, previewRoundId, showBrowseTemplates, communityPreviewRoundId])

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

  const communityPreviewRound = useMemo(
    () => customTemplates.find((round) => round.id === communityPreviewRoundId) || null,
    [customTemplates, communityPreviewRoundId]
  )
  const communityPreviewRow = useMemo(() => {
    if (!communityPreviewRound) return null
    return {
      round: communityPreviewRound,
      displayIndex: 0,
      selectedCount: 0,
      questionIds: communityPreviewRound.questions.map((question, questionIndex) => (
        String(question?.id || '').trim() || `${communityPreviewRound.id}-q${questionIndex + 1}`
      )),
      allSelected: false,
    }
  }, [communityPreviewRound])
  const communityPreviewSearchNormalized = useMemo(
    () => String(communityPreviewSearch || '').trim().toLowerCase(),
    [communityPreviewSearch]
  )
  const communityPreviewItems = useMemo(() => {
    if (!communityPreviewRow) return []
    return communityPreviewRow.round.questions
      .map((question, questionIndex) => {
        const questionId = communityPreviewRow.questionIds[questionIndex]
        const headline = questionPreviewHeadline(communityPreviewRow.round, question, questionIndex)
        const detail = questionPreviewDetail(communityPreviewRow.round, question)
        const tags = questionPreviewTags(communityPreviewRow.round, question)
        const answer = questionPreviewAnswer(communityPreviewRow.round, question)
        const searchable = [
          `q${questionIndex + 1}`, headline, detail, answer, ...tags,
          question?.promptText, question?.mediaUrl, question?.explanation,
          question?.answer, question?.term, question?.meaning, question?.sentence,
          question?.phrase, question?.title,
          Array.isArray(question?.options) ? question.options.join(' ') : '',
          Array.isArray(question?.countries) ? question.countries.join(' ') : '',
        ].map((value) => String(value || '').toLowerCase()).join(' ')
        return {
          key: questionId || `${communityPreviewRow.round.id}-q${questionIndex + 1}`,
          question,
          questionIndex,
          questionId,
          selected: false,
          headline,
          detail,
          tags,
          answer,
          searchable,
        }
      })
      .filter((item) => !communityPreviewSearchNormalized || item.searchable.includes(communityPreviewSearchNormalized))
  }, [communityPreviewRow, communityPreviewSearchNormalized])
  const communityPreviewMatchesLabel = useMemo(() => {
    if (!communityPreviewRow || !communityPreviewSearchNormalized) return ''
    const count = communityPreviewItems.length
    const total = communityPreviewRow.questionIds.length
    return `${count} of ${total} match${count === 1 ? '' : 'es'}`
  }, [communityPreviewItems.length, communityPreviewRow, communityPreviewSearchNormalized])

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
    clearSaveSuccess()
  }

  function openCommunityRoundPreview(roundId) {
    const id = String(roundId || '').trim()
    if (!id) return
    setCommunityPreviewRoundId(id)
    setCommunityPreviewSearch('')
  }

  function closeCommunityRoundPreview() {
    setCommunityPreviewRoundId('')
    setCommunityPreviewSearch('')
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
    setSelectedQuestionIds(buildHealthyDefaultSelection(builtinRounds))
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
    const payload = buildSnapshotPayloadFromSelection({
      roundRows,
      planCatalog: PLAN_CATALOG,
      selectedQuestionIds,
    })
    if (!payload.roundCatalog.length) {
      setError('Select at least one question to continue.')
      return
    }
    onConfirm(payload)
  }
  const canEditActiveRound = Boolean(activeRow && isCustomTemplateRound(activeRow.round))

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
  const browseSearchNormalized = String(browseSearch || '').trim().toLowerCase()
  const browseTemplateItems = customTemplates
    .map((round) => {
      const sampleHeadlines = round.questions.slice(0, 4).map((question) => (
        [
          question?.promptText,
          question?.answer,
          question?.term,
          question?.sentence,
          question?.meaning,
          question?.title,
          question?.phrase,
        ].filter(Boolean).join(' ')
      )).join(' ')
      const searchable = [round.name, round.intro, sampleHeadlines]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
      return {
        round,
        added: addedCustomRoundIds.has(round.id),
        searchable,
      }
    })
    .filter((item) => !browseSearchNormalized || item.searchable.includes(browseSearchNormalized))

  function handleAddCustomRound(roundId) {
    const id = String(roundId || '').trim()
    if (!id) return
    setAddedCustomRoundIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
    setError('')
  }

  function handleRemoveCustomRound(roundId) {
    const id = String(roundId || '').trim()
    if (!id) return
    const row = roundRows.find((entry) => entry.round.id === id)
    setAddedCustomRoundIds((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
    if (row?.questionIds?.length) {
      setSelectedQuestionIds((prev) => {
        const next = new Set(prev)
        row.questionIds.forEach((questionId) => next.delete(questionId))
        return next
      })
    }
  }

  function handleSelectRound(roundId) {
    if (roundListRef.current) {
      roundListScrollTopRef.current = roundListRef.current.scrollTop
    }
    if (questionScrollRef.current && activeRow?.round?.id) {
      questionScrollByRoundRef.current.set(activeRow.round.id, questionScrollRef.current.scrollTop)
    }
    setActiveRoundId(roundId)
    setQuestionSearch('')
  }

  return (
    <>
      <div className="gc2-wrap">
        <RoundSidebar
          activeRoundId={resolvedActiveRoundId}
          activeRoundsCount={activeRoundsCount}
          roundListRef={roundListRef}
          roundRows={roundRows}
          selectedQuestions={selectedQuestions}
          totalQuestions={totalQuestions}
          onBack={onBack}
          onContinue={handleContinue}
          onCreateRound={openCreateTemplateModal}
          onMoveRound={moveRound}
          onOpenBrowseTemplates={() => {
            setShowBrowseTemplates(true)
            setBrowseSearch('')
          }}
          onResetDefault={handleResetDefault}
          onSelectRound={handleSelectRound}
        />

        <GameConfigMainPanel
          activeRow={activeRow}
          questionSearch={questionSearch}
          onQuestionSearchChange={setQuestionSearch}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          onSelectAllActive={handleSelectAllActive}
          onClearActive={handleClearActive}
          onEditActiveRound={openSessionRoundEditor}
          canEditActiveRound={canEditActiveRound}
          recentlyClearedRound={recentlyClearedRound}
          onUndoClearRound={handleUndoClearRound}
          error={error}
          templatesError={templatesError}
          questionScrollRef={questionScrollRef}
          onQuestionScroll={() => {
            if (!questionScrollRef.current || !activeRow?.round?.id) return
            questionScrollByRoundRef.current.set(activeRow.round.id, questionScrollRef.current.scrollTop)
          }}
          activeQuestions={activeQuestions}
          onToggleQuestion={toggleQuestion}
          onOpenRoundPreview={openRoundPreview}
        />
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

      {showBrowseTemplates && (
        <BrowseTemplatesModal
          items={browseTemplateItems}
          search={browseSearch}
          setSearch={setBrowseSearch}
          onPreview={openCommunityRoundPreview}
          onAdd={handleAddCustomRound}
          onRemove={handleRemoveCustomRound}
          onClose={() => setShowBrowseTemplates(false)}
        />
      )}

      {communityPreviewRow && (
        <PreviewModal
          mode="community"
          previewRow={communityPreviewRow}
          previewSearch={communityPreviewSearch}
          setPreviewSearch={setCommunityPreviewSearch}
          previewSearchNormalized={communityPreviewSearchNormalized}
          previewMatchesLabel={communityPreviewMatchesLabel}
          previewItems={communityPreviewItems}
          isRoundAdded={addedCustomRoundIds.has(communityPreviewRow.round.id)}
          onAddRound={() => handleAddCustomRound(communityPreviewRow.round.id)}
          onRemoveRound={() => handleRemoveCustomRound(communityPreviewRow.round.id)}
          onClose={closeCommunityRoundPreview}
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
