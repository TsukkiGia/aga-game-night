import { useMemo, useState } from 'react'
import {
  questionPreviewAnswer,
  questionPreviewDetail,
  questionPreviewHeadline,
} from '../game-config/helpers'

export default function GamePlanPreview({
  roundCatalog,
  teams,
  onBack,
  onEditRound,
  onContinue,
}) {
  const rounds = useMemo(
    () => (Array.isArray(roundCatalog) ? roundCatalog : []).filter((round) => Array.isArray(round?.questions) && round.questions.length > 0),
    [roundCatalog]
  )

  const totalQuestions = useMemo(
    () => rounds.reduce((sum, round) => sum + round.questions.length, 0),
    [rounds]
  )
  const estRuntime = Math.max(1, Math.round(totalQuestions * 1.25))
  const teamCount = Array.isArray(teams) ? teams.length : (typeof teams === 'number' ? teams : null)

  const allRoundKeys = useMemo(
    () => rounds.map((round, i) => String(round?.id || `preview-round-${i}`)),
    [rounds]
  )
  const [expandedRoundIds, setExpandedRoundIds] = useState(() => new Set())
  const allExpanded = allRoundKeys.length > 0 && allRoundKeys.every((k) => expandedRoundIds.has(k))
  const allCollapsed = allRoundKeys.every((k) => !expandedRoundIds.has(k))

  function toggleRound(key) {
    setExpandedRoundIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <div className="gpp-wrap">
      {/* ── Header ── */}
      <div className="gpp-header">
        <div className="gpp-step-label">Step 3 · Preview</div>
        <h2 className="gpp-title">Final check before lobby</h2>
        <p className="gpp-subtitle">This is exactly what will run in your session.</p>
      </div>

      {/* ── Metrics ── */}
      <div className="gpp-metrics">
        <div className="gpp-metric">
          <span className="gpp-metric-label">Rounds</span>
          <strong className="gpp-metric-value">{rounds.length}</strong>
        </div>
        <div className="gpp-metric">
          <span className="gpp-metric-label">Questions</span>
          <strong className="gpp-metric-value">{totalQuestions}</strong>
        </div>
        {teamCount !== null && (
          <div className="gpp-metric">
            <span className="gpp-metric-label">Teams</span>
            <strong className="gpp-metric-value">{teamCount}</strong>
          </div>
        )}
        <div className="gpp-metric">
          <span className="gpp-metric-label">Est. Runtime</span>
          <strong className="gpp-metric-value">{estRuntime}<span className="gpp-metric-unit"> min</span></strong>
        </div>
      </div>

      {/* ── Bulk actions ── */}
      <div className="gpp-bulk-row">
        <button type="button" className="gpp-bulk-btn" onClick={() => setExpandedRoundIds(new Set(allRoundKeys))} disabled={allExpanded}>
          Expand all
        </button>
        <button type="button" className="gpp-bulk-btn" onClick={() => setExpandedRoundIds(new Set())} disabled={allCollapsed}>
          Collapse all
        </button>
      </div>

      {/* ── Round list ── */}
      <div className="gpp-rounds">
        {rounds.map((round, roundIndex) => {
          const key = String(round?.id || `preview-round-${roundIndex}`)
          const expanded = expandedRoundIds.has(key)
          const color = `var(--gc2-r${(roundIndex % 8) + 1})`
          const qCount = round.questions.length

          return (
            <div key={key} className="gpp-round" style={{ '--gpp-accent': color }}>
              <div className="gpp-round-row">
                <button
                  type="button"
                  className="gpp-round-toggle"
                  onClick={() => toggleRound(key)}
                  aria-expanded={expanded}
                >
                  <div className="gpp-round-left">
                    <span className="gpp-round-dot" />
                    <div className="gpp-round-info">
                      <span className="gpp-round-num">Round {roundIndex + 1}</span>
                      <span className="gpp-round-name">{round.name || `Round ${roundIndex + 1}`}</span>
                    </div>
                  </div>
                  <div className="gpp-round-right">
                    <span className="gpp-q-count">{qCount} {qCount === 1 ? 'question' : 'questions'}</span>
                    <span className={`gpp-chevron${expanded ? ' open' : ''}`}>⌄</span>
                  </div>
                </button>
                <button
                  type="button"
                  className="gpp-round-edit-btn"
                  onClick={() => {
                    if (typeof onEditRound === 'function') onEditRound(round?.id)
                    else onBack()
                  }}
                >
                  Edit
                </button>
              </div>

              {expanded && (
                <div className="gpp-round-body">
                  {round.intro && <p className="gpp-round-intro">{round.intro}</p>}
                  <div className="gpp-list">
                    {round.questions.map((question, qi) => {
                      const headline = questionPreviewHeadline(round, question, qi)
                      const detail = questionPreviewDetail(round, question)
                      const answer = questionPreviewAnswer(round, question)
                      return (
                        <div key={question?.id || `${key}-q-${qi}`} className="gpp-list-row">
                          <div className="gpp-list-qnum">Q{qi + 1}</div>
                          <div className="gpp-list-main">
                            <div className="gpp-list-title">{headline}</div>
                            {detail && <div className="gpp-list-sub">{detail}</div>}
                          </div>
                          <div className="gpp-list-answer">{answer || '—'}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Footer ── */}
      <div className="gpp-footer">
        <button type="button" className="gpp-back-btn" onClick={onBack}>← Back </button>
        <button type="button" className="gpp-continue-btn" onClick={onContinue}>Continue →</button>
      </div>
    </div>
  )
}
