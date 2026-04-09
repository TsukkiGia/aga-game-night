import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import QuestionView from './QuestionView'
import RoundIntroView from './RoundIntroView'
import HalftimeScreen from './HalftimeScreen'
import WinnerScreen from './WinnerScreen'
import SuddenDeathOverlay from './SuddenDeathOverlay'
import RoundTransitionScreen from './RoundTransitionScreen'
import ReactionLeaderboardModal from './ReactionLeaderboardModal'
import HostHelpModal from './HostHelpModal'
import HomeLobbyView from './HomeLobbyView'
import HomeBuzzOverlay from './HomeBuzzOverlay'
import { ENDPOINT } from '../config'
import { socket } from '../socket'
import rounds from '../rounds'
import { useGameState } from '../hooks/useGameState'
import { useGameSocket } from '../hooks/useGameSocket'
import { useNavigation } from '../hooks/useNavigation'
import { clearAll, clearHostCredentials } from '../storage'
import { playGameStart } from '../sounds'

export default function Scoreboard({ teams: initialTeams, onReset, onEndSession }) {
  const emitStreak = useCallback(({ teamIndex, streakCount }) => {
    socket.emit('host:streak', { teamIndex, streakCount })
  }, [])
  const [reactionStats, setReactionStats] = useState({})
  const handleBuzzAttemptForLeaderboard = useCallback((data) => {
    if (!data?.memberName) return
    if (!Number.isFinite(data.reactionMs)) return
    const name = String(data.memberName).trim()
    if (!name) return

    const teamIndex = Number.isInteger(data.teamIndex) ? data.teamIndex : -1
    const teamName = data.team?.name || ''
    const key = `${teamIndex}:${name.toLowerCase()}`
    const ms = Math.max(0, Math.round(data.reactionMs))

    setReactionStats((prev) => {
      const current = prev[key]
      if (!current) {
        return {
          ...prev,
          [key]: {
            key,
            name,
            teamName,
            teamIndex,
            bestMs: ms,
            lastMs: ms,
            totalMs: ms,
            attempts: 1,
          },
        }
      }
      return {
        ...prev,
        [key]: {
          ...current,
          teamName,
          teamIndex,
          bestMs: Math.min(current.bestMs, ms),
          lastMs: ms,
          totalMs: current.totalMs + ms,
          attempts: current.attempts + 1,
        },
      }
    })
  }, [])
  const runtimeHydratedRef = useRef(false)
  const {
    teams,
    streaks,
    doneQuestions,
    doublePoints,
    setDoublePoints,
    clearDoublePoints,
    adjust,
    resetForNewGame,
    markDone,
    hydrateFromServer,
  } = useGameState(initialTeams, { onStreak: emitStreak })
  const handleRuntimeSync = useCallback((serverState) => {
    hydrateFromServer(serverState)
    runtimeHydratedRef.current = true
  }, [hydrateFromServer])
  const { armed, buzzWinner, members, stealMode, hostReady, sessionCode, authState, submitAuth, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz, handleRearm, syncHostQuestion, timerControlSignal } = useGameSocket(
    initialTeams,
    { onBuzzAttempt: handleBuzzAttemptForLeaderboard, onStateSync: handleRuntimeSync }
  )
  const { activeQuestion, transition, navigate, dismissTransition } = useNavigation()
  const [showHalftime, setShowHalftime] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [suddenDeath, setSuddenDeath] = useState(false)
  const [tiedTeams, setTiedTeams] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const [showReactionLeaderboard, setShowReactionLeaderboard] = useState(false)
  const [endingSession, setEndingSession] = useState(false)
  const [showEndSessionConfirm, setShowEndSessionConfirm] = useState(false)
  const [endSessionError, setEndSessionError] = useState('')
  const [authForm, setAuthForm] = useState({ sessionCode: '', pin: '' })

  const reactionRows = useMemo(() => {
    return Object.values(reactionStats)
      .sort((a, b) => a.bestMs - b.bestMs)
  }, [reactionStats])

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

  useEffect(() => {
    if (!hostReady) runtimeHydratedRef.current = false
  }, [hostReady])

  useEffect(() => {
    if (!hostReady || !runtimeHydratedRef.current) return
    const payload = {
      teams: teams.map((team) => ({
        name: String(team.name || '').trim(),
        color: String(team.color || '').trim(),
        score: Number.isFinite(Number(team.score)) ? Number(team.score) : 0,
      })),
      doneQuestions: [...doneQuestions],
      streaks: [...streaks],
      doublePoints: Boolean(doublePoints),
    }
    socket.emit('host:runtime:update', payload)
  }, [hostReady, teams, doneQuestions, streaks, doublePoints])

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

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') {
        setShowReactionLeaderboard(false)
        return
      }
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      const tag = target?.tagName
      const isTypingField = target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (isTypingField) return
      const key = String(e.key || '').toUpperCase()
      if (key === 'T') {
        e.preventDefault()
        setShowReactionLeaderboard((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (normalizedActiveQuestion !== null) {
    const [rIdx, qIdx] = normalizedActiveQuestion
    function dismissBuzzAndResetMultiplier() {
      clearDoublePoints()
      handleDismiss()
    }
    function navigateWithReset(ri, qi = null) {
      const currentQuestionKey = Number.isInteger(qIdx) ? `${rIdx}-${qIdx}` : null
      const nextQuestionKey = Number.isInteger(qi) ? `${ri}-${qi}` : null
      if (nextQuestionKey && nextQuestionKey !== currentQuestionKey) {
        setReactionStats({})
      }
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
          <ReactionLeaderboardModal
            open={showReactionLeaderboard}
            rows={reactionRows}
            onClose={() => setShowReactionLeaderboard(false)}
          />
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
          onShowReactionLeaderboard={() => setShowReactionLeaderboard(true)}
          doublePoints={doublePoints}
          onToggleDouble={() => setDoublePoints(d => !d)}
        />
        {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
        {showWinner   && <WinnerScreen   teams={teams} onDismiss={() => setShowWinner(false)} onClose={() => { setShowWinner(false); clearAll(); onReset() }} onTiebreaker={handleTiebreaker} />}
        {suddenDeath  && <SuddenDeathOverlay tiedTeams={tiedTeams} buzzWinner={buzzWinner} onAward={handleSuddenDeathAward} onWrong={handleSuddenDeathWrong} onCancel={handleSuddenDeathCancel} />}
        <ReactionLeaderboardModal
          open={showReactionLeaderboard}
          rows={reactionRows}
          onClose={() => setShowReactionLeaderboard(false)}
        />
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
    setReactionStats({})
    socket.emit('host:new-game')
    clearAll()
    onReset()
  }

  function handleEndSession() {
    if (endingSession) return
    setEndSessionError('')
    setShowEndSessionConfirm(true)
  }

  function confirmEndSession() {
    if (endingSession) return
    if (!socket.connected) {
      setEndSessionError('Not connected to server. Reconnect and try again.')
      return
    }

    setEndingSession(true)
    socket.timeout(4000).emit('host:end-session', (err, result) => {
      if (err) {
        setEndingSession(false)
        setEndSessionError('Timed out ending session. Check your connection and try again.')
        return
      }
      if (!result?.ok) {
        setEndingSession(false)
        if (result?.error === 'unauthorized') {
          setEndSessionError('Host authorization expired. Sign in again.')
        } else {
          setEndSessionError('Could not end session. Please try again.')
        }
        return
      }

      clearAll()
      clearHostCredentials()
      setReactionStats({})
      setShowEndSessionConfirm(false)
      setEndSessionError('')
      onEndSession?.()
    })
  }

  return (
    <>
      <HomeBuzzOverlay buzzWinner={buzzWinner} onDismiss={handleDismiss} />
      <HostHelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        hostCompanionUrl={hostCompanionUrl}
      />
      {authState.required && (
        <div className="help-overlay" role="dialog" aria-modal="true">
          <div className="host-auth-modal">
            <div className="help-popup-tag">Host Sign In</div>
            <h2 className="host-auth-title">Reconnect Host Controller</h2>
            <p className="host-auth-sub">Enter session code and host PIN to control this game.</p>
            {authState.error && <div className="host-auth-error">{authState.error}</div>}
            <form
              className="host-auth-form"
              onSubmit={(e) => {
                e.preventDefault()
                void submitAuth(authForm.sessionCode || authState.sessionCode, authForm.pin)
              }}
            >
              <input
                className="team-name-input session-gate-input"
                type="text"
                value={authForm.sessionCode || authState.sessionCode}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, sessionCode: e.target.value.toUpperCase() }))}
                placeholder="Session code"
                maxLength={6}
                autoComplete="off"
                disabled={authState.authenticating}
              />
              <input
                className="team-name-input session-gate-input"
                type="password"
                inputMode="numeric"
                value={authForm.pin}
                onChange={(e) => setAuthForm((prev) => ({ ...prev, pin: e.target.value }))}
                placeholder="Host PIN"
                maxLength={8}
                disabled={authState.authenticating}
              />
              <button className="start-btn host-auth-submit-btn" type="submit" disabled={authState.authenticating}>
                {authState.authenticating ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      )}
      <ReactionLeaderboardModal
        open={showReactionLeaderboard}
        rows={reactionRows}
        onClose={() => setShowReactionLeaderboard(false)}
      />
      {showEndSessionConfirm && (
        <div className="help-overlay" onClick={() => !endingSession && setShowEndSessionConfirm(false)}>
          <div className="end-session-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-popup-tag">Confirm Action</div>
            <h2 className="end-session-title">End this session?</h2>
            <p className="end-session-copy">The session code will stop working and all players will disconnect.</p>
            {endSessionError && <div className="host-auth-error">{endSessionError}</div>}
            <div className="end-session-actions">
              <button
                className="back-btn"
                type="button"
                onClick={() => setShowEndSessionConfirm(false)}
                disabled={endingSession}
              >
                Cancel
              </button>
              <button
                className="home-end-session-btn end-session-confirm-btn"
                type="button"
                onClick={confirmEndSession}
                disabled={endingSession}
              >
                {endingSession ? 'Ending…' : 'End Session'}
              </button>
            </div>
          </div>
        </div>
      )}
      <HomeLobbyView
        teams={teams}
        members={members}
        buzzerUrl={buzzerUrl}
        launching={launching}
        onOpenHelp={() => setShowHelp(true)}
        onOpenReactionLeaderboard={() => setShowReactionLeaderboard(true)}
        onNewGame={handleNewGame}
        onEndSession={handleEndSession}
        endingSession={endingSession}
        onStart={handleStart}
        armed={armed}
        buzzWinner={buzzWinner}
        onArm={handleArm}
        onDismiss={handleDismiss}
      />
    </>
  )
}
