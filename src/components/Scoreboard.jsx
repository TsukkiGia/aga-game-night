import { useState } from 'react'
import TeamCard from './TeamCard'
import Leaderboard from './Leaderboard'
import QuestionView from './QuestionView'
import RoundIntroView from './RoundIntroView'
import QuestionsPicker from './QuestionsPicker'
import { ENDPOINT } from '../config'
import rounds from '../rounds'
import { useGameState } from '../hooks/useGameState'
import { useGameSocket } from '../hooks/useGameSocket'
import { useNavigation } from '../hooks/useNavigation'
import { clearAll } from '../storage'

export default function Scoreboard({ teams: initialTeams, onReset }) {
  const { teams, doneQuestions, flashing, adjust, resetScores, toggleDone } = useGameState(initialTeams)
  const { armed, buzzWinner, members, handleArm, handleDismiss } = useGameSocket(initialTeams)
  const { activeQuestion, questionsOpen, navigate, openQuestions, closeQuestions } = useNavigation()

  const buzzerUrl = `${ENDPOINT || window.location.origin}/buzz`

  if (activeQuestion !== null) {
    const [rIdx, qIdx] = activeQuestion
    function goBack() { handleDismiss(); navigate(null) }

    if (qIdx === null) {
      return (
        <RoundIntroView
          rounds={rounds}
          roundIndex={rIdx}
          doneQuestions={doneQuestions}
          onNavigate={navigate}
          onBack={goBack}
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
        members={members}
        buzzerUrl={buzzerUrl}
        buzzWinner={buzzWinner}
        armed={armed}
        isDone={doneQuestions.has(`${rIdx}-${qIdx}`)}
        onAdjust={adjust}
        onArm={handleArm}
        onDismiss={handleDismiss}
        onToggleDone={() => toggleDone(rIdx, qIdx)}
        onNavigate={navigate}
        onBack={goBack}
        onNext={() => navigate(rIdx, qIdx + 1)}
        onPrev={() => navigate(rIdx, qIdx - 1)}
      />
    )
  }

  const maxScore = Math.max(...teams.map(t => t.score), 1)
  const leaders = teams.filter(t => t.score === maxScore && maxScore > 0)

  return (
    <>
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

          <CodesPanel teams={teams} members={members} buzzerUrl={buzzerUrl} />

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
            <button className="questions-btn" onClick={openQuestions}>
              📋 Questions
            </button>
            <button className="reset-scores-btn" onClick={resetScores}>
              ↺ Reset Scores
            </button>
            <button className="new-game-btn" onClick={() => { clearAll(); onReset() }}>
              ◈ New Game
            </button>
          </div>
        </div>

        <Leaderboard teams={teams} />
      </div>

      {questionsOpen && (
        <QuestionsPicker
          doneQuestions={doneQuestions}
          onSelect={navigate}
          onClose={closeQuestions}
        />
      )}
    </>
  )
}

function CodesPanel({ teams, members, buzzerUrl }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="codes-panel">
      <button className="codes-toggle" onClick={() => setOpen(o => !o)}>
        <span>🔗 Team Buzzer Codes</span>
        <span className="codes-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
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
  )
}
