import { useState, useEffect, useRef } from 'react'
import { playPower, playTick, stopTick, playTimeUp } from '../sounds'
import VideoBody from './VideoBody'
import SlangBody from './SlangBody'
import CharadesBody from './CharadesBody'
import ThesisBody from './ThesisBody'

export default function QuestionView({
  rounds, roundIndex, questionIndex, doneQuestions,
  teams, buzzWinner, armed,
  onAdjust, onArm, onDismiss,
  stealMode, onWrongAndSteal, onManualBuzz,
  onMarkDone, onNavigate, onBack, onNext, onPrev,
  onHalftime, onWinner, doublePoints, onToggleDouble,
}) {
  const round = rounds[roundIndex]
  const question = round.questions[questionIndex]
  const total = round.questions.length
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [revealedInModal, setRevealedInModal] = useState(false)
  const [stealPickerOpen, setStealPickerOpen] = useState(false)
  const [stealSelected, setStealSelected] = useState(() => new Set(teams.map((_, i) => i)))
  const [revealedCountry, setRevealedCountry] = useState(false)
  const [buzzCountdown, setBuzzCountdown] = useState(null)
  const buzzCountdownRef = useRef(null)

  // Auto 10s countdown when a real buzz comes in (not manual, not steal)
  useEffect(() => {
    if (!buzzWinner || buzzWinner.manual) { setBuzzCountdown(null); return }
    setBuzzCountdown(10)
    let count = 10
    buzzCountdownRef.current = setInterval(() => {
      count--
      setBuzzCountdown(count)
      if (count > 0) {
        playTick()
      } else {
        stopTick()
        playTimeUp()
        clearInterval(buzzCountdownRef.current)
      }
    }, 1000)
    return () => { clearInterval(buzzCountdownRef.current); stopTick(); setBuzzCountdown(null) }
  }, [buzzWinner])

  function stopCountdown() {
    clearInterval(buzzCountdownRef.current)
    stopTick()
    setBuzzCountdown(null)
  }

  return (
    <div className="question-view">

      {/* ── Nav bar ─────────────────────────────────── */}
      <div className="qv-nav">
        <button className="qv-back" onClick={onBack}>← Back</button>
        <div className="qv-heading">
          <span className="qv-round-tag">{round.label}</span>
          <span className="qv-round-name">{round.name}</span>
        </div>
        <div className="qv-pagination">
          <span className="qv-counter">Q {questionIndex + 1} / {total}</span>
          <button className="qv-arrow" onClick={onPrev} disabled={questionIndex === 0}>‹</button>
          <button className="qv-arrow" onClick={() => { onMarkDone(); onNext() }}>›</button>
          <button className="halftime-btn" onClick={onHalftime}>⏸ Halftime</button>
          <button className="winner-btn" onClick={onWinner}>🏆 Winner</button>
        </div>
      </div>

      {/* ── Mini scoreboard ──────────────────────────── */}
      <div className="qv-scores">
        {teams.map((team, i) => (
          <div
            key={i}
            className={`qv-team-strip color-${team.color}${buzzWinner?.teamIndex === i ? ' qv-buzzed' : ''}`}
            onClick={() => !buzzWinner && onManualBuzz(i)}
            style={{ cursor: buzzWinner ? 'default' : 'pointer' }}
          >
            <div className="qv-strip-info">
              <span className="qv-strip-name">{team.name}</span>
              <span className="qv-strip-score">{team.score}</span>
            </div>
            <div className="qv-strip-btns">
              <button
                className="qv-pts-btn neg"
                onClick={(e) => {
                  e.stopPropagation()
                  onAdjust(i, -1)
                }}
              >
                −1
              </button>
              <button
                className="qv-pts-btn pos"
                onClick={(e) => {
                  e.stopPropagation()
                  onAdjust(i, +1)
                }}
              >
                +1
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Buzz popup modal ─────────────────────────── */}
      {buzzWinner?.team && (
        <div className="buzz-overlay" onClick={onDismiss}>
          <div
            className={`buzz-popup color-${buzzWinner.team.color}`}
            onClick={e => e.stopPropagation()}
          >
            {buzzCountdown !== null && (
              <div className="buzz-countdown-wrap">
                <div className={`buzz-countdown${buzzCountdown <= 3 ? ' urgent' : ''}`}>{buzzCountdown}</div>
                <div className="buzz-countdown-caption">seconds to answer</div>
              </div>
            )}
            <div className="buzz-popup-label">{stealMode ? '🔀 STEAL!' : 'BUZZED IN!'}</div>
            <div className="buzz-popup-name">
              {buzzWinner.memberName
                ? `${buzzWinner.memberName} just buzzed in for ${buzzWinner.team.name}!`
                : `${buzzWinner.team.name} buzzed in!`}
            </div>
            <div className="buzz-popup-score">Current Score: {teams[buzzWinner.teamIndex]?.score ?? 0} pts</div>
            <div className="buzz-popup-scoring">
              {round.scoring
                .filter(({ label }) => {
                  const isStealEntry = label.toLowerCase().includes('steal')
                  return stealMode ? isStealEntry : !isStealEntry
                })
                .map(({ label, points }) => {
                  const displayPoints = doublePoints ? points * 2 : points
                  return (
                    <button
                      key={label}
                      className={`buzz-pts-btn ${points > 0 ? 'pos' : 'neg'}`}
                      onClick={() => {
                        stopCountdown()
                        onAdjust(buzzWinner.teamIndex, points)
                        const canRevealAnswer = round.type === 'slang' || round.type === 'video' || round.type === 'charades'

                        if (stealMode) {
                          if (canRevealAnswer) setRevealedInModal(true)
                        } else if (round.type === 'video' && label === 'Correct country') {
                          setRevealedCountry(true)
                        } else if (points >= 3 && canRevealAnswer) {
                          setRevealedInModal(true)
                        }
                      }}
                      title={label}
                    >
                      <span className="buzz-pts-label">{label}</span>
                      <span className="buzz-pts-value">{displayPoints > 0 ? `+${displayPoints}` : displayPoints}</span>
                    </button>
                  )
                })}
            </div>

            {!stealMode && round.scoring.some(({ label }) => label.toLowerCase().includes('steal')) && (
              <button className="buzz-steal-btn" onClick={() => { setRevealedInModal(false); setRevealedCountry(false); onWrongAndSteal() }}>
                Open Steal
              </button>
            )}

            <button className="buzz-dismiss-btn" onClick={() => { setRevealedInModal(false); setRevealedCountry(false); onDismiss() }}>Reset Buzzers</button>

            {revealedCountry && !revealedInModal && round.type === 'video' && question.countries?.length > 0 && (
              <div className="buzz-popup-answer">
                <div className="buzz-popup-answer-label">Countries</div>
                <div className="buzz-popup-answer-text">{question.countries.join(', ')}</div>
              </div>
            )}

            {revealedInModal && (
              <div className="buzz-popup-answer">
                {round.type === 'slang' && (
                  <>
                    <div className="buzz-popup-answer-label">Meaning</div>
                    <div className="buzz-popup-answer-text">{question.meaning}</div>
                  </>
                )}
                {round.type === 'charades' && (
                  <>
                    <div className="buzz-popup-answer-label">Phrase</div>
                    <div className="buzz-popup-answer-text">{question.phrase}</div>
                  </>
                )}
                {round.type === 'video' && (
                  <>
                    <div className="buzz-popup-answer-label">Answer</div>
                    <div className="buzz-popup-answer-text">{question.answer}</div>
                    {question.explanation && (
                      <div className="buzz-popup-answer-explanation">{question.explanation}</div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main area: sidebar + body ───────────────── */}
      <div className="qv-main">

        {/* Left sidebar: question list */}
        <div className={`qv-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
          <button className="qv-sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}>
            {sidebarOpen ? '‹' : '›'}
          </button>
          {sidebarOpen && rounds.map((r, ri) => {
            const typeLabel = { video: 'Video', slang: 'Slang', charades: 'Charades', thesis: 'Thesis' }
            return (
              <div key={ri} className="qv-sidebar-group">
                <button
                  className={`qv-sidebar-round-label clickable${ri === roundIndex && questionIndex === null ? ' active-round' : ''}`}
                  onClick={() => onNavigate(ri, null)}
                >
                  {r.label}
                </button>
                {r.questions.map((_q, qi) => {
                  const done = doneQuestions?.has(`${ri}-${qi}`)
                  const active = ri === roundIndex && qi === questionIndex
                  return (
                    <button
                      key={qi}
                      className={`qv-sidebar-item${active ? ' active' : ''}${done ? ' done' : ''}`}
                      onClick={() => onNavigate(ri, qi)}
                    >
                      {done ? '✓ ' : ''}{typeLabel[r.type]} {qi + 1}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* ── Question body ────────────────────────────── */}
        <div className="qv-body">
          {round.type === 'video'    && <VideoBody    key={question.id} question={question} paused={!!buzzWinner} />}
          {round.type === 'slang'    && <SlangBody    key={question.id} question={question} />}
          {round.type === 'charades' && <CharadesBody key={question.id} question={question} />}
          {round.type === 'thesis'   && <ThesisBody   key={question.id} question={question} />}
        </div>

      </div> {/* end qv-main */}

      {/* ── Arm row ──────────────────────────────────── */}
      <div className="qv-arm-row arm-row">
        <button
          className={`double-pts-btn${doublePoints ? ' active' : ''}`}
          onClick={() => { if (!doublePoints) playPower(); onToggleDouble() }}
          title="Double points for this question"
        >
          {doublePoints ? '2× ON' : '2×'}
        </button>
        <button
          className={`arm-btn ${armed ? 'armed' : ''}`}
          onClick={onArm}
          disabled={armed || buzzWinner !== null}
        >
          {armed ? `🔴 Listening…${doublePoints ? ' (2×)' : ''}` : '🎯 Arm Buzzers'}
        </button>
        {armed && (
          <button className="arm-cancel-btn" onClick={onDismiss}>Cancel</button>
        )}
        {!armed && !buzzWinner && (
          <button
            className={`steal-open-btn${stealPickerOpen ? ' active' : ''}`}
            onClick={() => setStealPickerOpen(o => !o)}
          >
            🔀 Open Steal
          </button>
        )}
      </div>

      {/* ── Steal picker ─────────────────────────────── */}
      {stealPickerOpen && !armed && !buzzWinner && (
        <div className="steal-picker">
          <div className="steal-picker-label">Teams eligible to steal:</div>
          <div className="steal-picker-teams">
            {teams.map((t, i) => (
              <label key={i} className={`steal-picker-chip color-${t.color}${stealSelected.has(i) ? ' selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={stealSelected.has(i)}
                  onChange={() => {
                    setStealSelected(prev => {
                      const next = new Set(prev)
                      next.has(i) ? next.delete(i) : next.add(i)
                      return next
                    })
                  }}
                />
                {t.name}
              </label>
            ))}
          </div>
          <button
            className="steal-arm-btn"
            disabled={stealSelected.size === 0}
            onClick={() => {
              const allowedTeamIndices = [...stealSelected]
              setStealPickerOpen(false)
              onWrongAndSteal(allowedTeamIndices)
            }}
          >
            Arm Steal →
          </button>
        </div>
      )}
    </div>
  )
}
