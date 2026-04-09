import { useEffect, useState, useCallback, useMemo } from 'react'
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
import { clearAll } from '../storage'
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
  const { teams, streaks, doneQuestions, doublePoints, setDoublePoints, clearDoublePoints, adjust, resetForNewGame, markDone } = useGameState(initialTeams, { onStreak: emitStreak })
  const { armed, buzzWinner, members, stealMode, hostReady, sessionCode, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz, handleRearm, syncHostQuestion, timerControlSignal } = useGameSocket(initialTeams, { onBuzzAttempt: handleBuzzAttemptForLeaderboard })
  const { activeQuestion, transition, navigate, dismissTransition } = useNavigation()
  const [showHalftime, setShowHalftime] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [suddenDeath, setSuddenDeath] = useState(false)
  const [tiedTeams, setTiedTeams] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const [showReactionLeaderboard, setShowReactionLeaderboard] = useState(false)
  const [endingSession, setEndingSession] = useState(false)

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
      setReactionStats({})
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
      <ReactionLeaderboardModal
        open={showReactionLeaderboard}
        rows={reactionRows}
        onClose={() => setShowReactionLeaderboard(false)}
      />
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
