import QuestionSidebar from './QuestionSidebar'

function scoringToDisplayRows(scoring) {
  if (!scoring) return []
  if (Array.isArray(scoring)) {
    return scoring
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null
        return {
          label: String(entry.label || '').trim() || 'Score',
          points: Number.isFinite(Number(entry.points)) ? Number(entry.points) : 0,
        }
      })
      .filter(Boolean)
  }
  if (typeof scoring !== 'object') return []
  const s = scoring
  const rows = []
  rows.push({ label: s.correctLabel || 'Correct answer', points: s.correctPoints ?? 3 })
  for (const bonus of (Array.isArray(s.bonuses) ? s.bonuses : [])) {
    rows.push({ label: bonus.label, points: bonus.points })
  }
  rows.push({ label: s.wrongLabel || 'Wrong answer', points: s.wrongPoints ?? -1 })
  if (s.stealEnabled !== false) {
    rows.push({ label: 'Correct steal', points: s.correctStealPoints ?? 2 })
    rows.push({ label: 'Wrong steal', points: s.wrongStealPoints ?? 0 })
  }
  return rows
}

export default function RoundIntroView({
  planCatalog = null,
  rounds, roundIndex, doneQuestions,
  teams = [],
  streaks = [],
  onAdjust = null,
  onNavigate, onBack,
  onHalftime = null,
  isRoundIncluded = () => true,
  isQuestionIncluded = () => true,
  getRoundDisplayLabel = (ri) => `Round ${ri + 1}`,
  getQuestionDisplayNumber = (_ri, qi) => qi + 1,
  savedSidebarScrollTop = 0,
  onRememberSidebarScroll = null,
}) {
  const round = rounds[roundIndex]
  if (!round || typeof round !== 'object') {
    return (
      <div className="question-view">
        <div className="qv-nav">
          <button className="qv-back" onClick={onBack}>← Back</button>
          <div className="qv-heading">
            <span className="qv-round-tag">Round</span>
            <span className="qv-round-name">Unavailable</span>
          </div>
          <div />
        </div>
        <div className="qv-body">
          <div className="qv-empty-state">
            <div className="qv-empty-title">That round is unavailable.</div>
            <button className="qv-back" onClick={onBack}>Return to Home</button>
          </div>
        </div>
      </div>
    )
  }
  const safeRules = Array.isArray(round.rules) ? round.rules : []
  const safeQuestions = Array.isArray(round.questions) ? round.questions : []
  const safeScoringRows = scoringToDisplayRows(round.scoring)

  return (
    <div className="question-view">

      {/* Nav */}
      <div className="qv-nav">
        <button className="qv-back" onClick={onBack}>← Back</button>
        <div className="qv-heading">
          <span className="qv-round-tag">{getRoundDisplayLabel(roundIndex)}</span>
          <span className="qv-round-name">{round.name}</span>
        </div>
        <div className="qv-pagination">
          {typeof onHalftime === 'function' && (
            <button className="halftime-btn" onClick={onHalftime}>⏸ Halftime</button>
          )}
        </div>
      </div>

      {teams.length > 0 && (
        <div className="qv-scores">
          {teams.map((team, i) => (
            <div
              key={i}
              className={`qv-team-strip${typeof onAdjust === 'function' ? ' qv-team-strip-with-controls' : ''} color-${team.color}`}
            >
              <div className="qv-strip-info">
                <span className="qv-strip-name">
                  {team.name}
                  {streaks?.[i] >= 3 && <span className="qv-streak">🔥</span>}
                </span>
                <span className="qv-strip-score">{team.score}</span>
              </div>
              {typeof onAdjust === 'function' && (
                <div className="qv-strip-btns">
                  <button className="qv-pts-btn neg" onClick={() => onAdjust(i, -1)}>−1</button>
                  <button className="qv-pts-btn pos" onClick={() => onAdjust(i, +1)}>+1</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Main: sidebar + content */}
      <div className="qv-main">

        {/* Left sidebar */}
        <QuestionSidebar
          rounds={rounds}
          planCatalog={planCatalog}
          savedScrollTop={savedSidebarScrollTop}
          onRememberScroll={onRememberSidebarScroll}
          roundIndex={roundIndex}
          activeQuestionIndex={null}
          doneQuestions={doneQuestions}
          onNavigate={onNavigate}
          isRoundIncluded={isRoundIncluded}
          isQuestionIncluded={isQuestionIncluded}
          getRoundDisplayLabel={getRoundDisplayLabel}
          getQuestionDisplayNumber={getQuestionDisplayNumber}
        />

        {/* Intro content */}
        <div className="qv-body">
          <div className="round-intro">
            <div className="round-intro-tag">{getRoundDisplayLabel(roundIndex)}</div>
            <h2 className="round-intro-name">{round.name}</h2>
            <p className="round-intro-blurb">{round.intro}</p>

            <div className="round-intro-section">
              <div className="round-intro-section-label">Rules</div>
              <ul className="round-intro-rules">
                {safeRules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="round-intro-section">
              <div className="round-intro-section-label">Scoring</div>
              <div className="round-intro-scoring">
                {safeScoringRows.map(({ label, points }) => (
                  <div key={label} className={`round-intro-score-row ${points < 0 ? 'neg' : points === 0 ? 'neutral' : 'pos'}`}>
                    <span className="round-intro-score-pts">{points > 0 ? `+${points}` : points === 0 ? '—' : points}</span>
                    <span className="round-intro-score-label">{label}</span>
                  </div>
                ))}
              </div>
              {round.type === 'video' && safeQuestions.some((q) => Array.isArray(q.countries) && q.countries.length > 0) && (
                <p className="round-intro-steal-note">
                  Steal is always for the <strong>language</strong> (+2 pts), regardless of what the buzzing team got wrong. Country (+1) is only for the team that buzzed in — no country steal.
                </p>
              )}
            </div>

            <button
              className="round-intro-start-btn"
              onClick={() => onNavigate(roundIndex, 0)}
            >
              Start Round →
            </button>
          </div>
        </div>

      </div>
    </div>
  )
}
