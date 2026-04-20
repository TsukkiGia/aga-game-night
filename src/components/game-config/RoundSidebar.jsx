import { isCustomTemplateRound } from '../../roundCatalog'

export default function RoundSidebar({
  gameplayMode,
  activeRoundId,
  activeRoundsCount,
  roundListRef,
  roundRows,
  selectedQuestions,
  totalQuestions,
  onBack,
  onContinue,
  onCreateRound,
  onMoveRound,
  onOpenBrowseTemplates,
  onResetDefault,
  onSelectRound,
}) {
  function renderRoundListItem(row) {
    const isActive = activeRoundId === row.round.id
    const isCommunityCreated = isCustomTemplateRound(row.round)
    const isSelectable = row.supportedInMode !== false
    const itemDisabledReason = row.unsupportedReason || 'Unavailable in this gameplay mode.'
    const pct = row.questionIds.length > 0
      ? Math.round((row.selectedCount / row.questionIds.length) * 100)
      : 0

    const item = (
      <div
        key={row.round.id}
        role="button"
        tabIndex={0}
        aria-pressed={isActive}
        className={`gc2-round-item${isActive ? ' active' : ''}${!isSelectable ? ' disabled' : ''}`}
        style={{ '--round-color': `var(--gc2-r${(row.orderIndex % 8) + 1})` }}
        onClick={() => onSelectRound(row.round.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelectRound(row.round.id)
          }
        }}
      >
        <div className="gc2-round-item-top">
          <div className="gc2-round-item-meta">
            <span className="gc2-round-dot" />
            <span className="gc2-round-item-number">Round {row.displayIndex}</span>
          </div>
          <div className="gc2-round-item-right">
            {isCommunityCreated && (
              <span className="gc2-round-item-badge">Community-created</span>
            )}
            {!isSelectable && (
              <span className="gc2-round-item-badge">Hosted only</span>
            )}
            {!row.noneSelected && (
              <span className="gc2-round-item-count">{row.selectedCount} / {row.questionIds.length}</span>
            )}
            {isActive && (
              <div className="gc2-round-item-controls">
                <button
                  type="button"
                  className="gc2-move-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveRound(row.round.id, -1)
                  }}
                  disabled={row.orderIndex === 0}
                  title="Move up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="gc2-move-btn"
                  onClick={(e) => {
                    e.stopPropagation()
                    onMoveRound(row.round.id, 1)
                  }}
                  disabled={row.orderIndex === roundRows.length - 1}
                  title="Move down"
                >
                  ↓
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="gc2-round-item-name">{row.round.name}</div>
        <div className="gc2-round-progress">
          <div className="gc2-round-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )

    if (isSelectable) return item

    return (
      <span
        key={`${row.round.id}-disabled`}
        className="game-config-tooltip-trigger gc2-round-tooltip"
        data-tooltip={itemDisabledReason}
        role="note"
        tabIndex={0}
        aria-label={itemDisabledReason}
      >
        {item}
      </span>
    )
  }

  return (
    <aside className="gc2-sidebar">
      <div className="gc2-sidebar-head">
        <div className="gc2-sidebar-label">Step 2 · Game Plan</div>
        <h2 className="gc2-sidebar-title">Build your run of show</h2>
        {gameplayMode === 'hostless' && (
          <div className="gc2-mode-note">Host-less mode: charades and title translator are disabled.</div>
        )}
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

      <div className="gc2-round-list" ref={roundListRef}>
        {roundRows.map((row) => renderRoundListItem(row))}

        <button type="button" className="gc2-new-round-btn" onClick={onCreateRound}>
          + New Custom Round
        </button>
        <button type="button" className="gc2-browse-rounds-btn" onClick={onOpenBrowseTemplates}>
          Browse Community Rounds
        </button>
      </div>

      <div className="gc2-sidebar-footer">
        <button type="button" className="gc2-footer-btn gc2-footer-back" onClick={onBack}>← Back</button>
        <button type="button" className="gc2-footer-btn gc2-footer-reset" onClick={onResetDefault}>Default</button>
        <button
          type="button"
          className="gc2-footer-btn gc2-footer-continue"
          onClick={onContinue}
          disabled={selectedQuestions === 0}
        >
          Continue →
        </button>
      </div>
    </aside>
  )
}
