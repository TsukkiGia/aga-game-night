import { roundTooltipText } from './helpers'

export default function RoundCard({
  row,
  roundClearConfirmId,
  sessionEditedRoundIds,
  selectedQuestionIds,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onOpenPreview,
  onToggleRound,
  onToggleQuestion,
}) {
  const {
    round,
    roundIndex,
    displayIndex,
    questionIds,
    selectedCount,
    allSelected,
    noneSelected,
  } = row

  return (
    <div className={`game-config-round-card type-${round.type}${noneSelected ? ' off' : ''}`}>
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
          <div className="game-config-round-order-controls">
            <button
              type="button"
              className="game-config-round-order-btn"
              onClick={onMoveUp}
              disabled={!canMoveUp}
              aria-label={`Move ${round.name} up`}
              title="Move up"
            >
              ↑
            </button>
            <button
              type="button"
              className="game-config-round-order-btn"
              onClick={onMoveDown}
              disabled={!canMoveDown}
              aria-label={`Move ${round.name} down`}
              title="Move down"
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            className="game-config-round-preview-btn"
            onClick={() => onOpenPreview(round.id)}
          >
            Preview
          </button>
          <button
            type="button"
            className={`game-config-round-action${allSelected && roundClearConfirmId === round.id ? ' confirm-clear' : ''}`}
            onClick={() => onToggleRound({ round, roundIndex, questionIds, allSelected })}
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
                onToggleQuestion(questionId)
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
  )
}
