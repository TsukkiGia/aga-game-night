import { useState } from 'react'
import QuestionView from './QuestionView'
import RoundIntroView from './RoundIntroView'
import HalftimeScreen from './HalftimeScreen'
import WinnerScreen from './WinnerScreen'
import RoundTransitionScreen from './RoundTransitionScreen'
import CodesPanel from './CodesPanel'
import { ENDPOINT } from '../config'
import rounds from '../rounds'
import { useGameState } from '../hooks/useGameState'
import { useGameSocket } from '../hooks/useGameSocket'
import { useNavigation } from '../hooks/useNavigation'
import { clearAll } from '../storage'
import { playGameStart } from '../sounds'

export default function Scoreboard({ teams: initialTeams, onReset }) {
  const { teams, doneQuestions, doublePoints, setDoublePoints, adjust, resetForNewGame, toggleDone } = useGameState(initialTeams)
  const { armed, buzzWinner, members, stealMode, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz } = useGameSocket(initialTeams)
  const { activeQuestion, transition, navigate, dismissTransition } = useNavigation()
  const [showHalftime, setShowHalftime] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [launching, setLaunching] = useState(false)

  const buzzerUrl = `${ENDPOINT || window.location.origin}/buzz`

  if (activeQuestion !== null) {
    const [rIdx, qIdx] = activeQuestion
    function goBack() { handleDismiss(); setLaunching(false); navigate(null) }

    if (qIdx === null) {
      return (
        <>
          <RoundIntroView
            rounds={rounds}
            roundIndex={rIdx}
            doneQuestions={doneQuestions}
            onNavigate={(ri, qi) => navigate(ri, qi, rounds)}
            onBack={goBack}
          />
          {transition && <RoundTransitionScreen round={transition} onDone={dismissTransition} />}
        </>
      )
    }

    return (
      <>
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
          onAdjust={adjust}
          onArm={handleArm}
          onDismiss={handleDismiss}
          stealMode={stealMode}
          onWrongAndSteal={handleWrongAndSteal}
          onManualBuzz={(i) => handleManualBuzz(i, teams)}
          onToggleDone={() => toggleDone(rIdx, qIdx)}
          onNavigate={(ri, qi) => navigate(ri, qi, rounds)}
          onBack={goBack}
          onNext={() => {
            const isLastQuestion = qIdx === rounds[rIdx].questions.length - 1
            const isLastRound = rIdx === rounds.length - 1
            if (isLastQuestion && !isLastRound) navigate(rIdx + 1, null, rounds)
            else if (!isLastQuestion) navigate(rIdx, qIdx + 1)
          }}
          onPrev={() => navigate(rIdx, qIdx - 1)}
          onHalftime={() => setShowHalftime(true)}
          onWinner={() => setShowWinner(true)}
          doublePoints={doublePoints}
          onToggleDouble={() => setDoublePoints(d => !d)}
        />
        {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
        {showWinner   && <WinnerScreen   teams={teams} onDismiss={() => setShowWinner(false)} onClose={() => { setShowWinner(false); clearAll(); onReset() }} />}
      </>
    )
  }

  function handleStart() {
    resetForNewGame()
    setLaunching(true)
    playGameStart()
    setTimeout(() => navigate(0, null, rounds, true), 600)
  }

  return (
    <>
      {buzzWinner?.team && (
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

      <div className={`home-screen${launching ? ' launching' : ''}`}>
        <CodesPanel teams={teams} members={members} buzzerUrl={buzzerUrl} />

        <div className="home-hero">
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

          <button className="start-game-btn" onClick={handleStart}>
            ▶ Start Game
          </button>
        </div>
      </div>
    </>
  )
}
