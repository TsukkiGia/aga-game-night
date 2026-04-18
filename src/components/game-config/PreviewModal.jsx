import { CUSTOM_ROUND_TYPE } from '../../roundCatalog'
import { QuestionPreviewMedia } from './MediaPreviewBlocks'

export default function PreviewModal({
  previewRow,
  saveSuccess,
  roundClearConfirmId,
  previewSearch,
  setPreviewSearch,
  previewSearchNormalized,
  previewMatchesLabel,
  previewItems,
  onClose,
  onEditRound,
  onToggleRound,
  onToggleQuestion,
}) {
  return (
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
            <button type="button" className="back-btn" onClick={onClose}>Close</button>
            {previewRow.round.type === CUSTOM_ROUND_TYPE && (
              <button
                type="button"
                className="game-config-round-edit-btn"
                onClick={() => onEditRound(previewRow.round)}
              >
                Edit For Game
              </button>
            )}
            <button
              type="button"
              className={`game-config-round-action${previewRow.allSelected && roundClearConfirmId === previewRow.round.id ? ' confirm-clear' : ''}`}
              onClick={() => onToggleRound(previewRow)}
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
                      onToggleQuestion(questionId)
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
  )
}

