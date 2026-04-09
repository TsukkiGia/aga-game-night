import { useEffect, useState, useCallback, useMemo } from 'react'
import QuestionView from './QuestionView'
import RoundIntroView from './RoundIntroView'
import HalftimeScreen from './HalftimeScreen'
import WinnerScreen from './WinnerScreen'
import SuddenDeathOverlay from './SuddenDeathOverlay'
import CodesPanel from './CodesPanel'
import RoundTransitionScreen from './RoundTransitionScreen'
import { ENDPOINT } from '../config'
import { socket } from '../socket'
import rounds from '../rounds'
import { useGameState } from '../hooks/useGameState'
import { useGameSocket } from '../hooks/useGameSocket'
import { useNavigation } from '../hooks/useNavigation'
import { clearAll } from '../storage'
import { playGameStart } from '../sounds'

export default function Scoreboard({ teams: initialTeams, onReset, onEndSession }) {
  const emitStreak = useCallback(({ teamIndex, streakCount }) => {
    socket.emit('host:streak', { teamIndex, streakCount })
  }, [])
  const { teams, streaks, doneQuestions, doublePoints, setDoublePoints, clearDoublePoints, adjust, resetForNewGame, markDone } = useGameState(initialTeams, { onStreak: emitStreak })
  const { armed, buzzWinner, members, stealMode, hostReady, sessionCode, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz, handleRearm, syncHostQuestion, timerControlSignal } = useGameSocket(initialTeams)
  const { activeQuestion, transition, navigate, dismissTransition } = useNavigation()
  const [showHalftime, setShowHalftime] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [suddenDeath, setSuddenDeath] = useState(false)
  const [tiedTeams, setTiedTeams] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const [endingSession, setEndingSession] = useState(false)

  const normalizedActiveQuestion = useMemo(() => {
    if (activeQuestion === null) return null
    if (!Array.isArray(activeQuestion) || activeQuestion.length !== 2) return null
    const [rawRoundIndex, rawQuestionIndex] = activeQuestion
    if (!Number.isInteger(rawRoundIndex) || rawRoundIndex < 0 || rawRoundIndex >= rounds.length) return null
    const round = rounds[rawRoundIndex]
    if (rawQuestionIndex === null) return [rawRoundIndex, null]
    if (!Number.isInteger(rawQuestionIndex) || rawQuestionIndex < 0 || rawQuestionIndex >= round.questions.length) {
      return [rawRoundIndex, null]
    }
    return [rawRoundIndex, rawQuestionIndex]
  }, [activeQuestion])

  useEffect(() => {
    if (activeQuestion === null) return
    if (normalizedActiveQuestion === null) {
      navigate(null)
      return
    }
    const [aRound, aQuestion] = activeQuestion
    const [nRound, nQuestion] = normalizedActiveQuestion
    if (aRound !== nRound || aQuestion !== nQuestion) {
      navigate(nRound, nQuestion, rounds, true)
    }
  }, [activeQuestion, normalizedActiveQuestion, navigate])

  useEffect(() => {
    syncHostQuestion(normalizedActiveQuestion)
  }, [normalizedActiveQuestion, hostReady, syncHostQuestion])

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
    setTiedTeams([])
    setShowWinner(true)
  }

  const buzzerUrl = `${ENDPOINT || window.location.origin}/buzz${sessionCode ? `?s=${sessionCode}` : ''}`
  const hostCompanionUrl = `${ENDPOINT || window.location.origin}/host-mobile`

  useEffect(() => {
    if (!showHelp) return
    function onKeyDown(e) {
      if (e.key === 'Escape') setShowHelp(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showHelp])

  if (normalizedActiveQuestion !== null) {
    const [rIdx, qIdx] = normalizedActiveQuestion
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
          key={`${rIdx}-${qIdx}`}
          rounds={rounds}
          roundIndex={rIdx}
          questionIndex={qIdx}
          doneQuestions={doneQuestions}
          teams={teams}
          streaks={streaks}
          buzzWinner={buzzWinner}
          armed={armed}
          onAdjust={adjust}
          onArm={handleArm}
          onDismiss={dismissBuzzAndResetMultiplier}
          timerControlSignal={timerControlSignal}
          onTimerExpired={() => socket.emit('host:timer:expired')}
          stealMode={stealMode}
          onWrongAndSteal={(allowedTeamIndices) => handleWrongAndSteal(allowedTeamIndices)}
          onManualBuzz={(i) => handleManualBuzz(i, teams)}
          onMarkDone={() => { clearDoublePoints(); markDone(rIdx, qIdx) }}
          onNavigate={navigateWithReset}
          onBack={goBack}
          onNext={() => {
            const isLastQuestion = qIdx === rounds[rIdx].questions.length - 1
            const isLastRound = rIdx === rounds.length - 1
            if (isLastQuestion && isLastRound) setShowWinner(true)
            else if (isLastQuestion) navigateWithReset(rIdx + 1, null)
            else navigateWithReset(rIdx, qIdx + 1)
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
    socket.emit('host:new-game')
    clearAll()
    onReset()
  }

  function handleEndSession() {
    if (endingSession) return
    if (!window.confirm('End this session? The session code will stop working and players will be disconnected.')) return
    if (!socket.connected) {
      window.alert('Not connected to server. Reconnect and try again.')
      return
    }

    setEndingSession(true)
    socket.timeout(4000).emit('host:end-session', (err, result) => {
      if (err) {
        setEndingSession(false)
        window.alert('Timed out ending session. Check your connection and try again.')
        return
      }
      if (!result?.ok) {
        setEndingSession(false)
        if (result?.error === 'unauthorized') {
          window.alert('Host authorization expired. Refresh and sign in again.')
        } else {
          window.alert('Could not end session. Please try again.')
        }
        return
      }

      clearAll()
      try { sessionStorage.clear() } catch { /* ignore */ }
      onEndSession?.()
    })
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

      {showHelp && (
        <div className="help-overlay" onClick={() => setShowHelp(false)}>
          <div className="help-popup" onClick={(e) => e.stopPropagation()}>
            <div className="help-popup-head">
              <div>
                <div className="help-popup-tag">Host Guide</div>
                <h2 className="help-popup-title">How To Run The Game</h2>
              </div>
              <button className="help-close-btn" onClick={() => setShowHelp(false)}>✕</button>
            </div>

            <div className="help-sections">
              <section className="help-section">
                <h3>Host Companion</h3>
                <p>Open Host Companion on a phone/tablet to control timer and sound effects remotely.</p>
                <a className="help-link" href={hostCompanionUrl} target="_blank" rel="noreferrer">
                  Open Host Companion
                </a>
                <p>Use the same session code and host PIN when prompted.</p>
              </section>

              <section className="help-section">
                <h3>Buzzing Flow</h3>
                <ul>
                  <li>Press <strong>Arm Buzzers</strong> before answers.</li>
                  <li>First buzz locks everyone else out.</li>
                  <li>Press <strong>Reset Buzzers</strong> after scoring to reopen buzzing.</li>
                  <li>For steals, use <strong>Open Steal</strong> on question screens.</li>
                </ul>
              </section>

              <section className="help-section">
                <h3>Player Join</h3>
                <ul>
                  <li>Players scan the QR code or open the join link.</li>
                  <li>They choose a team and enter their name.</li>
                  <li>The member list on each team card updates live.</li>
                </ul>
              </section>

              <section className="help-section">
                <h3>Quick Troubleshooting</h3>
                <ul>
                  <li>If buzzing seems stuck, press <strong>Reset Buzzers</strong>.</li>
                  <li>If sound effects do not play, click anywhere once to unlock audio.</li>
                  <li>If state looks stale, reload the page and re-enter session code + PIN.</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      <div className={`home-screen${launching ? ' launching' : ''}`}>
        <CodesPanel teams={teams} members={members} buzzerUrl={buzzerUrl} />

        <div className="home-actions-bar">
          <div className="home-actions-secondary">
            <button className="home-help-btn" onClick={() => setShowHelp(true)}>? Help</button>
            <button className="home-new-game-btn" onClick={handleNewGame}>↺ New Game</button>
            <button className="home-end-session-btn" onClick={handleEndSession} disabled={endingSession}>
              {endingSession ? 'Ending…' : '✕ End Session'}
            </button>
          </div>
          <div className="home-actions-primary">
            <button className="home-start-game-btn" onClick={handleStart}>▶ Start Game</button>
            <button
              className={`arm-btn ${armed ? 'armed' : ''}`}
              onClick={handleArm}
              disabled={armed || buzzWinner !== null}
            >
              {armed ? '🔴 Listening…' : '🎯 Arm Buzzers'}
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
