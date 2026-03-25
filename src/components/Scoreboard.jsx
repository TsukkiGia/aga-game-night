import { useState, useEffect } from 'react'
import TeamCard from './TeamCard'
import Leaderboard from './Leaderboard'
import QuestionView from './QuestionView'
import RoundIntroView from './RoundIntroView'
import { socket } from '../socket'
import { ENDPOINT } from '../config'
import rounds from '../rounds'
import { playBuzzIn, playCorrect, playWrong } from '../sounds'

const SCORES_KEY = 'scorekeeping_scores'
const DONE_KEY   = 'scorekeeping_done'

function loadScores(initialTeams) {
  try {
    const saved = JSON.parse(localStorage.getItem(SCORES_KEY) || '{}')
    return initialTeams.map(t => ({ ...t, score: saved[t.code] ?? t.score }))
  } catch {
    return initialTeams
  }
}

function loadDone() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || '[]'))
  } catch {
    return new Set()
  }
}

export default function Scoreboard({ teams: initialTeams, onReset }) {
  const [teams, setTeams] = useState(() => loadScores(initialTeams))
  const [flashing, setFlashing] = useState(null)
  const [armed, setArmed] = useState(false)
  const [buzzWinner, setBuzzWinner] = useState(null) // { teamIndex, team }
  const [codesOpen, setCodesOpen] = useState(true)
  const [activeQuestion, setActiveQuestion] = useState(null)  // [roundIdx, qIdx] | null
  const [questionsOpen, setQuestionsOpen] = useState(false)
  const [doneQuestions, setDoneQuestions] = useState(() => loadDone())
  const [members, setMembers] = useState([])  // [[names for team 0], [names for team 1], ...]

  // Persist scores to localStorage on every change
  useEffect(() => {
    const s = {}
    teams.forEach(t => { s[t.code] = t.score })
    localStorage.setItem(SCORES_KEY, JSON.stringify(s))
  }, [teams])

  // Persist done questions to localStorage on every change
  useEffect(() => {
    localStorage.setItem(DONE_KEY, JSON.stringify([...doneQuestions]))
  }, [doneQuestions])

  function toggleDone(rIdx, qIdx) {
    const key = `${rIdx}-${qIdx}`
    setDoneQuestions(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  // Connect socket and register this session as host
  useEffect(() => {
    function setup() { socket.emit('host:setup', initialTeams) }

    socket.on('connect', setup)   // register BEFORE connect() so we never miss the event
    socket.connect()

    socket.on('buzz:armed',   () => setArmed(true))
    socket.on('buzz:reset',   () => { setArmed(false); setBuzzWinner(null) })
    socket.on('buzz:winner',  (data) => { setArmed(false); setBuzzWinner(data); playBuzzIn() })
    socket.on('host:members', (data) => setMembers(data))

    return () => {
      socket.off('connect', setup)
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.off('host:members')
      socket.disconnect()
    }
  }, [])

  function adjust(index, delta) {
    setTeams(prev =>
      prev.map((t, i) =>
        i === index ? { ...t, score: Math.max(0, t.score + delta) } : t
      )
    )
    setFlashing(`${index}-${delta > 0 ? 'up' : 'down'}`)
    setTimeout(() => setFlashing(null), 400)
    if (delta > 0) playCorrect()
    else playWrong()
  }

  function resetScores() {
    localStorage.removeItem(SCORES_KEY)
    localStorage.removeItem(DONE_KEY)
    setTeams(prev => prev.map(t => ({ ...t, score: 0 })))
    setDoneQuestions(new Set())
  }

  function handleArm() {
    setArmed(true)
    socket.emit('host:arm')
  }

  function handleDismiss() {
    setBuzzWinner(null)
    setArmed(false)
    socket.emit('host:reset')
  }

  if (activeQuestion !== null) {
    const [rIdx, qIdx] = activeQuestion

    if (qIdx === null) {
      return (
        <RoundIntroView
          rounds={rounds}
          roundIndex={rIdx}
          doneQuestions={doneQuestions}
          onNavigate={(ri, qi) => setActiveQuestion([ri, qi])}
          onBack={() => setActiveQuestion(null)}
        />
      )
    }

    return (
      <QuestionView
        rounds={rounds}
        roundIndex={rIdx}
        questionIndex={qIdx}
        doneQuestions={doneQuestions}
        teams={teams}
        buzzWinner={buzzWinner}
        armed={armed}
        isDone={doneQuestions.has(`${rIdx}-${qIdx}`)}
        onAdjust={adjust}
        onArm={handleArm}
        onDismiss={handleDismiss}
        onToggleDone={() => toggleDone(rIdx, qIdx)}
        onNavigate={(ri, qi) => setActiveQuestion([ri, qi])}
        onBack={() => setActiveQuestion(null)}
        onNext={() => setActiveQuestion([rIdx, qIdx + 1])}
        onPrev={() => setActiveQuestion([rIdx, qIdx - 1])}
      />
    )
  }

  const maxScore = Math.max(...teams.map(t => t.score), 1)
  const leaders = teams.filter(t => t.score === maxScore && maxScore > 0)
  const buzzerUrl = `${ENDPOINT || window.location.origin}/buzz`

  return (
    <>
      {/* Buzz winner popup */}
      {buzzWinner && (
        <div className="buzz-overlay" onClick={handleDismiss}>
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
            <div className="buzz-popup-icon">🔔</div>
            <button className="buzz-dismiss-btn" onClick={handleDismiss}>
              Reset Buzzers
            </button>
          </div>
        </div>
      )}

      <div className="scoreboard-layout">
        <div className="scoreboard">

          {/* Team codes panel */}
          <div className="codes-panel">
            <button
              className="codes-toggle"
              onClick={() => setCodesOpen(o => !o)}
            >
              <span>🔗 Team Buzzer Codes</span>
              <span className="codes-chevron">{codesOpen ? '▲' : '▼'}</span>
            </button>
            {codesOpen && (
              <div className="codes-body">
                <p className="codes-hint">
                  Team members go to <strong>{buzzerUrl}</strong> and enter their code to buzz in
                </p>
                <div className="codes-grid">
                  {teams.map((t, i) => (
                    <div key={t.code} className={`code-chip color-${t.color}`}>
                      <span className="code-team-name">{t.name}</span>
                      <span className="code-value">{t.code}</span>
                      {members[i]?.length > 0 && (
                        <span className="code-members">{members[i].join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Arm button */}
          <div className="arm-row">
            <button
              className={`arm-btn ${armed ? 'armed' : ''}`}
              onClick={handleArm}
              disabled={armed || buzzWinner !== null}
            >
              {armed ? '🔴 Listening for buzz…' : '🎯 Arm Buzzers'}
            </button>
            {armed && (
              <button className="arm-cancel-btn" onClick={handleDismiss}>Cancel</button>
            )}
          </div>

          <div className="scoreboard-grid" data-count={teams.length}>
            {teams.map((team, i) => (
              <TeamCard
                key={i}
                team={team}
                index={i}
                maxScore={maxScore}
                isLeading={leaders.includes(team)}
                flashing={flashing}
                onAdjust={(delta) => adjust(i, delta)}
              />
            ))}
          </div>

          <div className="scoreboard-controls">
            <button className="questions-btn" onClick={() => setQuestionsOpen(true)}>
              📋 Questions
            </button>
            <button className="reset-scores-btn" onClick={resetScores}>
              ↺ Reset Scores
            </button>
            <button className="new-game-btn" onClick={() => { localStorage.removeItem(SCORES_KEY); localStorage.removeItem(DONE_KEY); onReset() }}>
              ◈ New Game
            </button>
          </div>
        </div>

        <Leaderboard teams={teams} />
      </div>

      {/* ── Questions picker modal ──────────────────── */}
      {questionsOpen && (
        <div className="questions-overlay" onClick={() => setQuestionsOpen(false)}>
          <div className="questions-panel" onClick={e => e.stopPropagation()}>
            <div className="questions-panel-header">
              <span>Questions</span>
              <button className="questions-panel-close" onClick={() => setQuestionsOpen(false)}>✕</button>
            </div>
            <div className="questions-panel-body">
              {rounds.map((round, rIdx) => (
                <div key={rIdx} className="qp-round">
                  <button
                    className="qp-round-header"
                    onClick={() => { setActiveQuestion([rIdx, null]); setQuestionsOpen(false) }}
                  >
                    {round.label} — {round.name}
                  </button>
                  <div className="qp-questions-list">
                    {round.questions.map((q, qIdx) => {
                      const label =
                        round.type === 'video'    ? `Video ${qIdx + 1}` :
                        round.type === 'slang'    ? `Slang ${qIdx + 1}` :
                        round.type === 'charades' ? `Charades ${qIdx + 1}` :
                                                    `Thesis ${qIdx + 1}`
                      const done = doneQuestions.has(`${rIdx}-${qIdx}`)
                      return (
                        <button
                          key={qIdx}
                          className={`qp-question-btn${done ? ' done' : ''}`}
                          onClick={() => { setActiveQuestion([rIdx, qIdx]); setQuestionsOpen(false) }}
                        >
                          {done ? '✓ ' : ''}{label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
