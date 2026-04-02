import { useState } from 'react'
import QuestionView from './QuestionView'
import RoundIntroView from './RoundIntroView'
import HalftimeScreen from './HalftimeScreen'
import WinnerScreen from './WinnerScreen'
import SuddenDeathOverlay from './SuddenDeathOverlay'
import CodesPanel from './CodesPanel'
import RoundTransitionScreen from './RoundTransitionScreen'
import { ENDPOINT } from '../config'
import rounds from '../rounds'
import { useGameState } from '../hooks/useGameState'
import { useGameSocket } from '../hooks/useGameSocket'
import { useNavigation } from '../hooks/useNavigation'
import { clearAll } from '../storage'
import { playGameStart } from '../sounds'

export default function Scoreboard({ teams: initialTeams, onReset }) {
  const { teams, doneQuestions, doublePoints, setDoublePoints, clearDoublePoints, adjust, resetForNewGame, toggleDone, markDone } = useGameState(initialTeams)
  const { armed, buzzWinner, members, stealMode, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz, handleRearm } = useGameSocket(initialTeams)
  const { activeQuestion, transition, navigate, dismissTransition } = useNavigation()
  const [showHalftime, setShowHalftime] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [suddenDeath, setSuddenDeath] = useState(false)
  const [tiedTeams, setTiedTeams] = useState([])

  function handleTiebreaker(winners) {
    setShowWinner(false)
    setTiedTeams(winners)
    setSuddenDeath(true)
    const allowedTeamIndices = winners.map(w => w.originalIndex)
    handleArm({ allowedTeamIndices })
  }

  function handleSuddenDeathAward(teamIndex) {
    adjust(teamIndex, 1)
    handleDismiss()
    setSuddenDeath(false)
    setShowWinner(true)
  }

  function handleSuddenDeathWrong() {
    const allowedTeamIndices = tiedTeams.map(w => w.originalIndex)
    handleRearm({ allowedTeamIndices })
  }

  function handleSuddenDeathCancel() {
    handleDismiss()
    setSuddenDeath(false)
    setShowWinner(true)
  }

  const buzzerUrl = `${ENDPOINT || window.location.origin}/buzz`

  if (activeQuestion !== null) {
    const [rIdx, qIdx] = activeQuestion
    function dismissBuzzAndResetMultiplier() {
      clearDoublePoints()
      handleDismiss()
    }
    function navigateWithReset(ri, qi = null) {
      clearDoublePoints()
      handleDismiss()
      navigate(ri, qi, rounds)
    }
    function goBack() {
      dismissBuzzAndResetMultiplier()
      setLaunching(false)
      navigate(null)
    }

    if (qIdx === null) {
      return (
        <>
          <RoundIntroView
            rounds={rounds}
            roundIndex={rIdx}
            doneQuestions={doneQuestions}
            teams={teams}
            members={members}
            buzzerUrl={buzzerUrl}
            onNavigate={navigateWithReset}
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
          buzzWinner={buzzWinner}
          armed={armed}
          onAdjust={adjust}
          onArm={handleArm}
          onDismiss={dismissBuzzAndResetMultiplier}
          stealMode={stealMode}
          onWrongAndSteal={(allowedTeamIndices) => handleWrongAndSteal(allowedTeamIndices)}
          onManualBuzz={(i) => handleManualBuzz(i, teams)}
          onMarkDone={() => markDone(rIdx, qIdx)}
          onNavigate={navigateWithReset}
          onBack={goBack}
          onNext={() => {
            const isLastQuestion = qIdx === rounds[rIdx].questions.length - 1
            const isLastRound = rIdx === rounds.length - 1
            if (isLastQuestion && !isLastRound) navigateWithReset(rIdx + 1, null)
            else if (!isLastQuestion) navigateWithReset(rIdx, qIdx + 1)
          }}
          onPrev={() => navigateWithReset(rIdx, qIdx - 1)}
          onHalftime={() => setShowHalftime(true)}
          onWinner={() => setShowWinner(true)}
          doublePoints={doublePoints}
          onToggleDouble={() => setDoublePoints(d => !d)}
        />
        {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
        {showWinner   && <WinnerScreen   teams={teams} onDismiss={() => setShowWinner(false)} onClose={() => { setShowWinner(false); clearAll(); onReset() }} onTiebreaker={handleTiebreaker} />}
        {suddenDeath  && <SuddenDeathOverlay tiedTeams={tiedTeams} buzzWinner={buzzWinner} onAward={handleSuddenDeathAward} onWrong={handleSuddenDeathWrong} onCancel={handleSuddenDeathCancel} />}
      </>
    )
  }

  function handleStart() {
    resetForNewGame()
    setLaunching(true)
    playGameStart()
    setTimeout(() => navigate(0, null, rounds, true), 600)
  }

  function handleNewGame() {
    clearDoublePoints()
    handleDismiss()
    clearAll()
    onReset()
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
          <div className="home-actions-row">
            <button className="home-new-game-btn" onClick={handleNewGame}>
              ↺ New Game
            </button>

            <button className="home-start-game-btn" onClick={handleStart}>
              ▶ Start Game
            </button>

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
        </div>
      </div>
    </>
  )
}
