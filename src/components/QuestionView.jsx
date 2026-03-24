import { useState, useEffect } from 'react'

export default function QuestionView({
  rounds, roundIndex, questionIndex, doneQuestions,
  teams, buzzWinner, armed,
  isDone, onAdjust, onArm, onDismiss,
  onToggleDone, onNavigate, onBack, onNext, onPrev,
}) {
  const round = rounds[roundIndex]
  const question = round.questions[questionIndex]
  const total = round.questions.length
  const [revealed, setRevealed] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  useEffect(() => { setRevealed(false) }, [questionIndex])

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
              {round.scoring.map(({ label, points }) => (
                <button
                  key={label}
                  className={`qv-pts-btn ${points > 0 ? 'pos' : 'neg'}`}
                  onClick={() => onAdjust(i, points)}
                  title={label}
                >
                  {points > 0 ? `+${points}` : points}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Buzz banner ──────────────────────────────── */}
      {buzzWinner && (
        <div className={`qv-buzz-banner color-${buzzWinner.team.color}`}>
          <span>🔔 {buzzWinner.memberName
            ? <><strong>{buzzWinner.memberName}</strong> just buzzed in for {buzzWinner.team.name}!</>
            : <><strong>{buzzWinner.team.name}</strong> buzzed in!</>}
          </span>
          <button className="qv-buzz-reset" onClick={onDismiss}>Reset Buzzers</button>
        </div>
      )}

      {/* ── Main area: sidebar + body ───────────────── */}
      <div className="qv-main">

      {/* Sidebar */}
      <div className={`qv-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
        <button className="qv-sidebar-toggle" onClick={() => setSidebarOpen(o => !o)}>
          {sidebarOpen ? '‹' : '›'}
        </button>
        {sidebarOpen && rounds.map((r, ri) => {
          const typeLabel = { video: 'Video', slang: 'Slang', charades: 'Charades', thesis: 'Thesis' }
          return (
            <div key={ri} className="qv-sidebar-group">
              <div className="qv-sidebar-round-label">{r.label}</div>
              {r.questions.map((q, qi) => {
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
        {round.type === 'video' && (
          <VideoBody key={question.id} question={question} revealed={revealed} onReveal={() => setRevealed(true)} />
        )}
        {round.type === 'slang' && (
          <SlangBody key={question.id} question={question} revealed={revealed} onReveal={() => setRevealed(true)} />
        )}
        {round.type === 'charades' && (
          <CharadesBody key={question.id} question={question} />
        )}
        {round.type === 'thesis' && (
          <ThesisBody key={question.id} question={question} />
        )}
      </div>
      </div> {/* end qv-main */}

      {/* ── Arm row (hidden for thesis) ──────────────── */}
      {round.type !== 'thesis' && round.type !== 'charades' && (
        <div className="qv-arm-row arm-row">
          <button
            className={`arm-btn ${armed ? 'armed' : ''}`}
            onClick={onArm}
            disabled={armed || buzzWinner !== null}
          >
            {armed ? '🔴 Listening for buzz…' : '🎯 Arm Buzzers'}
          </button>
          {armed && (
            <button className="arm-cancel-btn" onClick={onDismiss}>Cancel</button>
          )}
        </div>
      )}
    </div>
  )
}

function VideoBody({ question, revealed, onReveal }) {
  return (
    <div className="qv-video-wrap">
      <video className="qv-video" src={`/videos/${question.video}`} controls />
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={onReveal}>Reveal Answer ▼</button>
      ) : (
        <div className="qv-answer-card">
          <div className="qv-answer-label">Answer</div>
          <div className="qv-answer-text">{question.answer || '(add answer to rounds.js)'}</div>
          {question.explanation && (
            <>
              <div className="qv-answer-label" style={{ marginTop: 12 }}>Explanation</div>
              <div className="qv-answer-explanation">{question.explanation}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function SlangBody({ question, revealed, onReveal }) {
  return (
    <div className="qv-slang-wrap">
      <div className="qv-slang-meta">{question.language} · {question.country}</div>
      <div className="qv-slang-term">{question.term}</div>
      <div className="qv-slang-sentence">"{question.sentence}"</div>
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={onReveal}>Reveal Meaning ▼</button>
      ) : (
        <div className="qv-answer-card">
          <div className="qv-answer-label">Meaning</div>
          <div className="qv-answer-text">{question.meaning}</div>
        </div>
      )}
    </div>
  )
}

function CharadesBody({ question }) {
  return (
    <div className="qv-charades-wrap">
      <div className="qv-charades-label">Act this out</div>
      <div className="qv-charades-phrase">{question.phrase}</div>
    </div>
  )
}

function ThesisBody({ question }) {
  return (
    <div className="qv-thesis-wrap">
      <div className="qv-thesis-title">{question.title}</div>
      <div className="qv-thesis-modes">
        <div className="qv-thesis-modes-label">Translate into:</div>
        {question.options.map(opt => (
          <div key={opt} className="qv-thesis-mode">◈ {opt}</div>
        ))}
      </div>
    </div>
  )
}
