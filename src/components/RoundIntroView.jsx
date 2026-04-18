import { useEffect, useRef, useState } from 'react'
import { questionItemIdFor } from '../gamePlan'

function isQuestionDone(doneQuestions, roundIndex, questionIndex, planCatalog) {
  if (doneQuestions?.has(`${roundIndex}-${questionIndex}`)) return true
  if (!planCatalog) return false
  const itemId = questionItemIdFor(roundIndex, questionIndex, planCatalog)
  return Boolean(itemId && doneQuestions?.has(itemId))
}

export default function RoundIntroView({
  planCatalog = null,
  rounds, roundIndex, doneQuestions,
  onNavigate, onBack,
  isRoundIncluded = () => true,
  isQuestionIncluded = () => true,
  getRoundDisplayLabel = (ri) => `Round ${ri + 1}`,
  getQuestionDisplayNumber = (_ri, qi) => qi + 1,
}) {
  const round = rounds[roundIndex]
  const [sidebarScrollTop, setSidebarScrollTop] = useState(0)

  return (
    <div className="question-view">

      {/* Nav */}
      <div className="qv-nav">
        <button className="qv-back" onClick={onBack}>← Back</button>
        <div className="qv-heading">
          <span className="qv-round-tag">{getRoundDisplayLabel(roundIndex)}</span>
          <span className="qv-round-name">{round.name}</span>
        </div>
        <div />
      </div>

      {/* Main: sidebar + content */}
      <div className="qv-main">

        {/* Left sidebar */}
        <Sidebar
          rounds={rounds}
          planCatalog={planCatalog}
          savedScrollTop={sidebarScrollTop}
          onRememberScroll={setSidebarScrollTop}
          roundIndex={roundIndex}
          activeQIdx={null}
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
                {round.rules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="round-intro-section">
              <div className="round-intro-section-label">Scoring</div>
              <div className="round-intro-scoring">
                {round.scoring.map(({ label, points }) => (
                  <div key={label} className={`round-intro-score-row ${points < 0 ? 'neg' : points === 0 ? 'neutral' : 'pos'}`}>
                    <span className="round-intro-score-pts">{points > 0 ? `+${points}` : points === 0 ? '—' : points}</span>
                    <span className="round-intro-score-label">{label}</span>
                  </div>
                ))}
              </div>
              {round.type === 'video' && round.questions.some((q) => Array.isArray(q.countries) && q.countries.length > 0) && (
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

function Sidebar({
  planCatalog,
  savedScrollTop,
  onRememberScroll,
  rounds,
  roundIndex,
  activeQIdx,
  doneQuestions,
  onNavigate,
  isRoundIncluded,
  isQuestionIncluded,
  getRoundDisplayLabel,
  getQuestionDisplayNumber,
}) {
  const sidebarRef = useRef(null)

  useEffect(() => {
    const container = sidebarRef.current
    if (!container) return
    container.scrollTop = Number(savedScrollTop) || 0
  }, [savedScrollTop])

  function navigateFromSidebar(nextRoundIndex, nextQuestionIndex) {
    if (sidebarRef.current) {
      onRememberScroll?.(sidebarRef.current.scrollTop)
    }
    onNavigate(nextRoundIndex, nextQuestionIndex)
  }

  return (
    <div
      className="qv-sidebar"
      ref={sidebarRef}
      onScroll={() => {
        if (!sidebarRef.current) return
        onRememberScroll?.(sidebarRef.current.scrollTop)
      }}
    >
      {rounds.map((r, ri) => {
        if (!isRoundIncluded(ri)) return null
        const typeLabel = { video: 'Video', slang: 'Slang', charades: 'Charades', thesis: 'Thesis', 'custom-buzz': 'Question' }
        return (
          <div key={ri} className="qv-sidebar-group">
            <button
              className={`qv-sidebar-round-label clickable${ri === roundIndex && activeQIdx === null ? ' active-round' : ''}`}
              onClick={() => navigateFromSidebar(ri, null)}
            >
              {getRoundDisplayLabel(ri)}
            </button>
            {r.questions.map((_q, qi) => {
              if (!isQuestionIncluded(ri, qi)) return null
              const done = isQuestionDone(doneQuestions, ri, qi, planCatalog)
              const active = ri === roundIndex && qi === activeQIdx
              const displayNumber = getQuestionDisplayNumber(ri, qi)
              return (
                <button
                  key={qi}
                  className={`qv-sidebar-item${active ? ' active' : ''}${done ? ' done' : ''}`}
                  onClick={() => navigateFromSidebar(ri, qi)}
                >
                  {done ? '✓ ' : ''}{typeLabel[r.type] || 'Q'} {displayNumber}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
