import { useMemo, useState } from 'react'
import rounds from '../rounds'
import { buildPlanCatalog, defaultPlanIds, normalizePlanIdsWithRoundIntros } from '../gamePlan'

const PLAN_CATALOG = buildPlanCatalog(rounds)

function buildInitialSelection(initialPlanIds) {
  const normalized = normalizePlanIdsWithRoundIntros(initialPlanIds, PLAN_CATALOG, { fallbackToDefault: true })
  const selected = new Set()
  for (const id of normalized) {
    const item = PLAN_CATALOG.byId.get(id)
    if (!item || item.type !== 'question') continue
    selected.add(item.id)
  }
  return selected
}

export default function GameConfig({ initialPlanIds, onConfirm, onBack }) {
  const [selectedQuestionIds, setSelectedQuestionIds] = useState(() => buildInitialSelection(initialPlanIds))
  const [error, setError] = useState('')

  const roundRows = useMemo(() => {
    return rounds.map((round, roundIndex) => {
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
  }, [selectedQuestionIds])
  const totalQuestions = useMemo(
    () => roundRows.reduce((sum, row) => sum + row.questionIds.length, 0),
    [roundRows]
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
    const defaults = defaultPlanIds(PLAN_CATALOG)
    setSelectedQuestionIds(buildInitialSelection(defaults))
    setError('')
  }

  function handleContinue() {
    const nextPlanIds = []
    roundRows.forEach(({ roundIndex, questionIds }) => {
      const selectedForRound = questionIds.filter((id) => selectedQuestionIds.has(id))
      if (selectedForRound.length === 0) return
      const introId = PLAN_CATALOG.introIdByRoundIndex.get(roundIndex)
      if (introId) nextPlanIds.push(introId)
      nextPlanIds.push(...selectedForRound)
    })

    if (nextPlanIds.length === 0) {
      setError('Select at least one question to continue.')
      return
    }

    onConfirm(nextPlanIds)
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

        <div className="game-config-rounds">
          {roundRows.map(({ round, roundIndex, questionIds, selectedCount, allSelected, noneSelected }) => (
            <div key={round.id} className={`game-config-round-card type-${round.type}${noneSelected ? ' off' : ''}`}>
              <div className="game-config-round-head">
                <div className="game-config-round-title-wrap">
                  <span className="game-config-round-pill">{round.label}</span>
                  <div className="game-config-round-title">{round.name}</div>
                  <div className="game-config-round-meta">{selectedCount} of {questionIds.length} questions selected</div>
                </div>
                <button
                  type="button"
                  className="game-config-round-action"
                  onClick={() => toggleRound(roundIndex)}
                >
                  {allSelected ? 'Clear Round' : 'Select Round'}
                </button>
              </div>
              <div className="game-config-question-grid">
                {round.questions.map((_, questionIndex) => {
                  const questionId = PLAN_CATALOG.questionIdByRoundQuestion.get(`${roundIndex}-${questionIndex}`)
                  const selected = selectedQuestionIds.has(questionId)
                  return (
                    <button
                      key={questionId}
                      type="button"
                      aria-pressed={selected}
                      className={`game-config-question-item${selected ? ' selected' : ''}`}
                      onClick={() => toggleQuestion(questionId)}
                    >
                      <span className="game-config-question-check">{selected ? '✓' : '+'}</span>
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
    </div>
  )
}
