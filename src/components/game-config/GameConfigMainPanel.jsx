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

export default function GameConfigMainPanel({
  activeRow,
  questionSearch,
  onQuestionSearchChange,
  viewMode,
  onViewModeChange,
  onSelectAllActive,
  onClearActive,
  onEditActiveRound,
  canEditActiveRound,
  recentlyClearedRound,
  onUndoClearRound,
  error,
  templatesError,
  questionScrollRef,
  onQuestionScroll,
  activeQuestions,
  onToggleQuestion,
  onOpenRoundPreview,
}) {
  const editDisabledReason = 'Only custom Buzz rounds can be edited. Built-in rounds support question selection only.'

  return (
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
              onClick={() => onOpenRoundPreview(activeRow.round.id)}
            >
              Round preview →
            </button>
          </div>

          <div className="gc2-toolbar">
            <input
              type="text"
              className="gc2-search"
              value={questionSearch}
              onChange={(e) => onQuestionSearchChange(e.target.value)}
              placeholder={`Search ${activeRow.questionIds.length} questions by prompt, answer, or tag`}
            />
            <div className="gc2-view-toggle">
              <button
                type="button"
                className={`gc2-view-btn${viewMode === 'grid' ? ' active' : ''}`}
                onClick={() => onViewModeChange('grid')}
              >Grid</button>
              <button
                type="button"
                className={`gc2-view-btn${viewMode === 'list' ? ' active' : ''}`}
                onClick={() => onViewModeChange('list')}
              >List</button>
            </div>
            <button type="button" className="gc2-toolbar-btn" onClick={onSelectAllActive}>
              Select all
            </button>
            <button type="button" className="gc2-toolbar-btn" onClick={onClearActive}>
              Clear
            </button>
            {canEditActiveRound ? (
              <button
                type="button"
                className="gc2-toolbar-btn"
                onClick={() => onEditActiveRound(activeRow.round.id)}
                title="Edit this custom round for this session only."
              >
                Edit for session
              </button>
            ) : (
              <span
                className="game-config-tooltip-trigger gc2-disabled-tooltip"
                data-tooltip={editDisabledReason}
                tabIndex={0}
                role="note"
                aria-label={editDisabledReason}
              >
                <button
                  type="button"
                  className="gc2-toolbar-btn"
                  disabled
                >
                  Edit for session
                </button>
              </span>
            )}
          </div>

          {recentlyClearedRound && (
            <div className="gc2-undo-bar">
              <span>{recentlyClearedRound.roundName} cleared.</span>
              <button type="button" onClick={onUndoClearRound}>Undo</button>
            </div>
          )}
          {error && <p className="gc2-error">{error}</p>}
          {templatesError && <p className="gc2-error">{templatesError}</p>}

          <div className="gc2-question-scroll" ref={questionScrollRef} onScroll={onQuestionScroll}>
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
                      onClick={() => { if (questionId) onToggleQuestion(questionId) }}
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
                      onClick={() => { if (questionId) onToggleQuestion(questionId) }}
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
  )
}
