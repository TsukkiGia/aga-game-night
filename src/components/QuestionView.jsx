import { useState } from 'react'
import { playPower } from '../sounds'
import BuzzModal from './BuzzModal'
import VideoBody from './VideoBody'
import SlangBody from './SlangBody'
import CharadesBody from './CharadesBody'
import ThesisBody from './ThesisBody'

export default function QuestionView({
  rounds, roundIndex, questionIndex, doneQuestions,
  teams, streaks, buzzWinner, armed,
  onAdjust, onArm, onDismiss,
  stealMode, onWrongAndSteal, onManualBuzz,
  onMarkDone, onNavigate, onBack, onNext, onPrev,
  onHalftime, doublePoints, onToggleDouble, timerControlSignal, onTimerExpired,
}) {
  const round = rounds[roundIndex]
  const question = round?.questions?.[questionIndex]
  const total = round?.questions?.length || 0
  const isCharades = round?.type === 'charades'
  const isThesis   = round?.type === 'thesis'

  const activePair = isCharades
    ? new Set([(questionIndex * 2) % teams.length, (questionIndex * 2 + 1) % teams.length])
    : isThesis
    ? new Set([questionIndex % teams.length])
    : null

  const [sidebarOpen, setSidebarOpen] = useState(true)
  function defaultStealSelection() {
    const allTeams = new Set(teams.map((_, i) => i))
    if (!isCharades) return allTeams
    const firstActive = (questionIndex * 2) % teams.length
    const secondActive = (questionIndex * 2 + 1) % teams.length
    allTeams.delete(firstActive)
    allTeams.delete(secondActive)
    return allTeams
  }
  const [stealPickerOpen, setStealPickerOpen] = useState(false)
  const [stealSelected, setStealSelected] = useState(() => defaultStealSelection())
  const [correctGiven, setCorrectGiven] = useState(false)

  if (!round || !question) {
    return (
      <div className="question-view">
        <div className="qv-nav">
          <button className="qv-back" onClick={onBack}>← Back</button>
          <div className="qv-heading">
            <span className="qv-round-tag">Question</span>
            <span className="qv-round-name">Unavailable</span>
          </div>
          <div />
        </div>
        <div className="qv-body">
          <div className="qv-empty-state">
            <div className="qv-empty-title">That question no longer exists.</div>
            <button className="qv-back" onClick={onBack}>Return to Home</button>
          </div>
        </div>
      </div>
    )
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
        </div>
      </div>

      {/* ── Mini scoreboard ──────────────────────────── */}
      <div className="qv-scores">
        {teams.map((team, i) => (
          <div
            key={i}
            className={`qv-team-strip color-${team.color}${buzzWinner?.teamIndex === i ? ' qv-buzzed' : ''}${activePair?.has(i) ? ' qv-active' : ''}`}
            onClick={() => !buzzWinner && onManualBuzz(i)}
            style={{ cursor: buzzWinner ? 'default' : 'pointer' }}
          >
            <div className="qv-strip-info">
              <span className="qv-strip-name">
                {team.name}
                {streaks?.[i] >= 3 && <span className="qv-streak">🔥</span>}
              </span>
              <span className="qv-strip-score">{team.score}</span>
            </div>
            <div className="qv-strip-btns">
              <button className="qv-pts-btn neg" onClick={e => { e.stopPropagation(); onAdjust(i, -1) }}>−1</button>
              <button className="qv-pts-btn pos" onClick={e => { e.stopPropagation(); onAdjust(i, +1) }}>+1</button>
            </div>
          </div>
        ))}
      </div>

      {/* ── Buzz modal ───────────────────────────────── */}
      <BuzzModal
        buzzWinner={buzzWinner}
        teams={teams}
        round={round}
        question={question}
        stealMode={stealMode}
        doublePoints={doublePoints}
        stealAllowedTeamIndices={isCharades ? [...defaultStealSelection()] : null}
        onAdjust={onAdjust}
        onDismiss={onDismiss}
        onWrongAndSteal={onWrongAndSteal}
        timerControlSignal={timerControlSignal}
        onTimerExpired={onTimerExpired}
      />

      {/* ── Main area: sidebar + body ───────────────── */}
      <div className="qv-main">

        {/* Left sidebar */}
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

        {/* ── Question body ── */}
        <div className="qv-body">
          {round.type === 'video'    && <VideoBody    key={question.id} question={question} paused={!!buzzWinner} />}
          {round.type === 'slang'    && <SlangBody    key={question.id} question={question} />}
          {round.type === 'charades' && (
            <div className="charades-wrap">
              <div className="charades-active-teams">
                {[...activePair].map(i => (
                  <button
                    key={i}
                    className={`charades-active-chip color-${teams[i].color}`}
                    onClick={() => {
                      const pts = round.scoring.find(s => s.points > 0 && !s.label.toLowerCase().includes('steal'))?.points ?? 3
                      onAdjust(i, pts)
                    }}
                    title={`Award ${teams[i].name} correct answer points`}
                  >
                    {teams[i].name}
                  </button>
                ))}
                <span className="charades-active-label">are up</span>
              </div>
              <CharadesBody key={question.id} question={question} />
            </div>
          )}
          {isThesis && (
            <div className="charades-wrap">
              <div className="charades-active-teams">
                {[...activePair].map(i => (
                  <button
                    key={i}
                    className={`charades-active-chip color-${teams[i].color}`}
                    onClick={() => {
                      const pts = round.scoring.find(s => s.points > 0)?.points ?? 3
                      onAdjust(i, pts)
                      setCorrectGiven(true)
                    }}
                    title={`Award ${teams[i].name} majority vote points`}
                  >
                    {teams[i].name}
                  </button>
                ))}
                <span className="charades-active-label">is up</span>
              </div>
              <ThesisBody key={question.id} question={question} />
            </div>
          )}
        </div>

      </div>

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
        {!armed && !buzzWinner && !correctGiven && isCharades && (
          <button
            className={`steal-open-btn${stealPickerOpen ? ' active' : ''}`}
            onClick={() => setStealPickerOpen((open) => !open)}
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
                    setStealSelected((prev) => {
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
