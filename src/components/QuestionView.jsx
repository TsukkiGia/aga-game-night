import { useState } from 'react'
import VideoBody from './VideoBody'
import SlangBody from './SlangBody'
import CharadesBody from './CharadesBody'
import ThesisBody from './ThesisBody'
import QRImg from './QRImg'

export default function QuestionView({
  rounds, roundIndex, questionIndex, doneQuestions,
  teams, members, buzzerUrl, buzzWinner, armed,
  isDone, onAdjust, onArm, onDismiss,
  onToggleDone, onNavigate, onBack, onNext, onPrev,
  onHalftime, onWinner, doublePoints, onToggleDouble,
}) {
  const round = rounds[roundIndex]
  const question = round.questions[questionIndex]
  const total = round.questions.length
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [codesOpen, setCodesOpen] = useState(false)
  const [revealedInModal, setRevealedInModal] = useState(false)

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
          <button className="qv-arrow" onClick={onNext} disabled={questionIndex === total - 1}>›</button>
          <button className={`qv-done-btn${isDone ? ' done' : ''}`} onClick={onToggleDone}>
            {isDone ? '✓ Done' : 'Mark Done'}
          </button>
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
          >
            <div className="qv-strip-info">
              <span className="qv-strip-name">{team.name}</span>
              <span className="qv-strip-score">{team.score}</span>
            </div>
            <div className="qv-strip-btns">
              <button className="qv-pts-btn neg" onClick={() => onAdjust(i, -1)}>−1</button>
              <button className="qv-pts-btn pos" onClick={() => onAdjust(i, +1)}>+1</button>
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
            <div className="buzz-popup-label">BUZZED IN!</div>
            <div className="buzz-popup-name">
              {buzzWinner.memberName
                ? `${buzzWinner.memberName} just buzzed in for ${buzzWinner.team.name}!`
                : `${buzzWinner.team.name} buzzed in!`}
            </div>
            <div className="buzz-popup-score">Current Score: {teams[buzzWinner.teamIndex]?.score ?? 0} pts</div>
            <div className="buzz-popup-scoring">
              {round.scoring.map(({ label, points }) => (
                <button
                  key={label}
                  className={`buzz-pts-btn ${points > 0 ? 'pos' : 'neg'}`}
                  onClick={() => {
                    onAdjust(buzzWinner.teamIndex, points)
                    if (points > 0 && (round.type === 'slang' || round.type === 'video')) {
                      setRevealedInModal(true)
                    }
                  }}
                  title={label}
                >
                  <span className="buzz-pts-label">{label}</span>
                  <span className="buzz-pts-value">{points > 0 ? `+${points}` : points}</span>
                </button>
              ))}
            </div>

            {revealedInModal && (
              <div className="buzz-popup-answer">
                {round.type === 'slang' && (
                  <>
                    <div className="buzz-popup-answer-label">Meaning</div>
                    <div className="buzz-popup-answer-text">{question.meaning}</div>
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

            <button className="buzz-dismiss-btn" onClick={() => { setRevealedInModal(false); onDismiss() }}>Reset Buzzers</button>
          </div>
        </div>
      )}

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
                  className="qv-sidebar-round-label clickable"
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
          {round.type === 'video'    && <VideoBody    key={question.id} question={question} />}
          {round.type === 'slang'    && <SlangBody    key={question.id} question={question} />}
          {round.type === 'charades' && <CharadesBody key={question.id} question={question} />}
          {round.type === 'thesis'   && <ThesisBody   key={question.id} question={question} />}
        </div>

        {/* Right sidebar: team codes */}
        <div className={`qv-codes-sidebar${codesOpen ? '' : ' collapsed'}`}>
          <button className="qv-sidebar-toggle" onClick={() => setCodesOpen(o => !o)}>
            {codesOpen ? '›' : '‹'}
          </button>
          {codesOpen && (
            <>
              <QRImg url={buzzerUrl} />
              <div className="qv-codes-url">{buzzerUrl}</div>
              {teams.map((t, i) => (
                <div key={t.code} className={`qv-codes-chip color-${t.color}`}>
                  <span className="qv-codes-chip-name">{t.name}</span>
                  <span className="qv-codes-chip-code">{t.code}</span>
                  {members?.[i]?.length > 0 && (
                    <span className="qv-codes-chip-members">{members[i].join(', ')}</span>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

      </div> {/* end qv-main */}

      {/* ── Arm row ──────────────────────────────────── */}
      <div className="qv-arm-row arm-row">
        <button
          className={`double-pts-btn${doublePoints ? ' active' : ''}`}
          onClick={onToggleDouble}
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
      </div>
    </div>
  )
}
