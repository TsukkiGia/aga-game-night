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
import { normalizeRoundCatalog } from '../roundCatalog'
import { useGameState } from '../hooks/useGameState'
import { useGameSocket } from '../hooks/useGameSocket'
import { useNavigation } from '../hooks/useNavigation'
import { clearAll, clearHostCredentials } from '../storage'
import { playGameStart } from '../sounds'
import { clearQuestionLastFromReactionStats, normalizeReactionStats, updateReactionStatsWithAttempt } from '../reactionStats'
import {
  buildPlanCatalog,
  normalizePlanIdsWithRoundIntros,
  normalizeCursorId,
  normalizeDoneQuestionIds,
  resolveEffectivePlanForSync,
  firstQuestionIdInRound,
  questionItemIdFor,
} from '../gamePlan'

const RUNTIME_PERSIST_TIMEOUT_MS = 3000
const RUNTIME_PERSIST_RETRY_BASE_MS = 600
const RUNTIME_PERSIST_RETRY_MAX_MS = 5000
const DEFAULT_ROUND_CATALOG = normalizeRoundCatalog(rounds)

export default function Scoreboard({ teams: initialTeams, initialPlanIds, initialRoundCatalog, onReset, onEndSession }) {
  const emitStreak = useCallback(({ teamIndex, streakCount }) => {
    socket.emit('host:streak', { teamIndex, streakCount })
  }, [])
  const [reactionStats, setReactionStats] = useState({})
  const handleBuzzAttemptForLeaderboard = useCallback((data) => {
    setReactionStats((prev) => updateReactionStatsWithAttempt(prev, data))
  }, [])
  const runtimeHydratedRef = useRef(false)
  const [roundCatalog, setRoundCatalog] = useState(() => {
    const normalized = normalizeRoundCatalog(initialRoundCatalog)
    return normalized.length > 0 ? normalized : DEFAULT_ROUND_CATALOG
  })
  const planCatalog = useMemo(() => buildPlanCatalog(roundCatalog), [roundCatalog])
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
  } = useGameState(initialTeams, { onStreak: emitStreak, roundCatalog })
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
  const [startingNewGame, setStartingNewGame] = useState(false)
  const [newGameError, setNewGameError] = useState('')
  const [authForm, setAuthForm] = useState({ sessionCode: '', pin: '' })
  const [gamePlanIds, setGamePlanIds] = useState(() =>
    normalizePlanIdsWithRoundIntros(initialPlanIds, buildPlanCatalog(normalizeRoundCatalog(initialRoundCatalog).length > 0 ? normalizeRoundCatalog(initialRoundCatalog) : DEFAULT_ROUND_CATALOG), { fallbackToDefault: true })
  )

  const reactionRows = useMemo(() => {
    return Object.values(reactionStats)
      .sort((a, b) => {
        const aHasQuestionLast = Number.isInteger(a.questionLastMs)
        const bHasQuestionLast = Number.isInteger(b.questionLastMs)
        if (aHasQuestionLast && bHasQuestionLast) {
          if (a.questionLastMs !== b.questionLastMs) return a.questionLastMs - b.questionLastMs
        } else if (aHasQuestionLast !== bHasQuestionLast) {
          return aHasQuestionLast ? -1 : 1
        }
        if (a.bestMs !== b.bestMs) return a.bestMs - b.bestMs
        return a.name.localeCompare(b.name)
      })
  }, [reactionStats])
  const questionRaceRows = useMemo(
    () => reactionRows.filter((row) => Number.isInteger(row.questionLastMs)),
    [reactionRows]
  )

  const normalizedPlanIds = useMemo(
    () => normalizePlanIdsWithRoundIntros(gamePlanIds, planCatalog, { fallbackToDefault: true }),
    [gamePlanIds, planCatalog]
  )
  const planIdSet = useMemo(() => new Set(normalizedPlanIds), [normalizedPlanIds])
  const plannedItems = useMemo(
    () => normalizedPlanIds.map((id) => planCatalog.byId.get(id)).filter(Boolean),
    [normalizedPlanIds, planCatalog]
  )
  const activeQuestionId = useMemo(
    () => normalizeCursorId(activeQuestion, normalizedPlanIds, planCatalog),
    [activeQuestion, normalizedPlanIds, planCatalog]
  )
  const activeItem = useMemo(
    () => (activeQuestionId ? planCatalog.byId.get(activeQuestionId) || null : null),
    [activeQuestionId, planCatalog]
  )
  const activePlanIndex = useMemo(
    () => (activeQuestionId ? normalizedPlanIds.indexOf(activeQuestionId) : -1),
    [activeQuestionId, normalizedPlanIds]
  )
  const activeLegacyPair = useMemo(
    () => (activeItem ? [activeItem.roundIndex, activeItem.questionIndex] : null),
    [activeItem]
  )
  const [activeRoundIndex, activeQuestionIndex] = activeLegacyPair || [null, null]
  const plannedRoundIndexSet = useMemo(() => {
    const set = new Set()
    plannedItems.forEach((item) => set.add(item.roundIndex))
    return set
  }, [plannedItems])
  const hasPlannedQuestions = plannedItems.some((item) => item.type === 'question')
  const planDisplay = useMemo(() => {
    const roundDisplayNumberByIndex = new Map()
    const questionDisplayNumberByItemId = new Map()
    const questionTotalByRound = new Map()
    let roundCounter = 0
    for (const item of plannedItems) {
      if (!roundDisplayNumberByIndex.has(item.roundIndex)) {
        roundCounter += 1
        roundDisplayNumberByIndex.set(item.roundIndex, roundCounter)
      }
      if (item.type !== 'question') continue
      const nextNumber = (questionTotalByRound.get(item.roundIndex) || 0) + 1
      questionTotalByRound.set(item.roundIndex, nextNumber)
      questionDisplayNumberByItemId.set(item.id, nextNumber)
    }
    return {
      roundDisplayNumberByIndex,
      questionDisplayNumberByItemId,
      questionTotalByRound,
    }
  }, [plannedItems])
  const getRoundDisplayLabel = useCallback((roundIndex) => {
    const displayNumber = planDisplay.roundDisplayNumberByIndex.get(roundIndex) || (roundIndex + 1)
    return `Round ${displayNumber}`
  }, [planDisplay])
  const getQuestionDisplayNumber = useCallback((roundIndex, questionIndex) => {
    const id = questionItemIdFor(roundIndex, questionIndex, planCatalog)
    if (!id) return questionIndex + 1
    return planDisplay.questionDisplayNumberByItemId.get(id) || (questionIndex + 1)
  }, [planDisplay, planCatalog])
  const getQuestionTotal = useCallback((roundIndex) => {
    return planDisplay.questionTotalByRound.get(roundIndex) || (roundCatalog[roundIndex]?.questions?.length || 0)
  }, [planDisplay, roundCatalog])
  const transitionRoundLabel = useMemo(() => {
    if (!transition) return null
    const idx = roundCatalog.findIndex((round) => round?.id === transition?.id)
    if (idx < 0) return transition.label
    return getRoundDisplayLabel(idx)
  }, [transition, getRoundDisplayLabel, roundCatalog])

  const handleRuntimeSync = useCallback((serverState) => {
    const serverRoundCatalog = normalizeRoundCatalog(serverState?.roundCatalog)
    const effectiveRoundCatalog = serverRoundCatalog.length > 0
      ? serverRoundCatalog
      : (roundCatalog.length > 0 ? roundCatalog : DEFAULT_ROUND_CATALOG)
    const effectivePlanCatalog = buildPlanCatalog(effectiveRoundCatalog)
    const effectivePlan = resolveEffectivePlanForSync(serverState?.gamePlan, normalizedPlanIds, effectivePlanCatalog)

    // On brand-new "New Game" flows, server state can temporarily have an empty
    // plan before the client's selected plan is persisted. Keep local plan in
    // that window to avoid remapping UI back to default ordering.
    setRoundCatalog(effectiveRoundCatalog)
    setGamePlanIds(effectivePlan)
    setReactionStats(normalizeReactionStats(serverState?.reactionStats))
    const normalizedDone = normalizeDoneQuestionIds(serverState?.doneQuestions, effectivePlanCatalog)
    hydrateFromServer({ ...serverState, doneQuestions: normalizedDone, roundCatalog: effectiveRoundCatalog })
    const nextCursor = normalizeCursorId(serverState?.hostQuestionCursor, effectivePlan, effectivePlanCatalog)
    navigate(nextCursor, { silent: true })
    runtimeHydratedRef.current = true
  }, [hydrateFromServer, navigate, normalizedPlanIds, roundCatalog])

  const setupPayload = useMemo(() => ({
    gamePlan: normalizedPlanIds,
    roundCatalog,
  }), [normalizedPlanIds, roundCatalog])

  const { armed, buzzWinner, members, stealMode, hostReady, sessionCode, authState, submitAuth, handleArm, handleDismiss, handleWrongAndSteal, handleManualBuzz, handleRearm, syncHostQuestion, timerControlSignal, invalidateAuth } = useGameSocket(
    initialTeams,
    { onBuzzAttempt: handleBuzzAttemptForLeaderboard, onStateSync: handleRuntimeSync, setupPayload }
  )

  useEffect(() => {
    if (activeQuestion === null) return
    if (activeQuestionId === null) {
      navigate(null, { silent: true })
      return
    }
    if (activeQuestion !== activeQuestionId) {
      navigate(activeQuestionId, { silent: true })
    }
  }, [activeQuestion, activeQuestionId, navigate])

  useEffect(() => {
    syncHostQuestion(activeQuestionId)
  }, [activeQuestionId, hostReady, syncHostQuestion])

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
      gamePlan: normalizedPlanIds,
      roundCatalog,
      reactionStats: normalizeReactionStats(reactionStats),
    }

    let cancelled = false
    let retryCount = 0
    let retryTimer = null

    function scheduleRetry() {
      if (cancelled) return
      const delay = Math.min(
        RUNTIME_PERSIST_RETRY_MAX_MS,
        RUNTIME_PERSIST_RETRY_BASE_MS * (2 ** Math.min(retryCount, 4))
      )
      retryCount += 1
      retryTimer = setTimeout(send, delay)
    }

    function send() {
      if (cancelled) return
      socket.timeout(RUNTIME_PERSIST_TIMEOUT_MS).emit('host:runtime:update', payload, (err, result) => {
        if (cancelled) return
        if (!err && result?.ok) return
        if (result?.error === 'unauthorized') {
          invalidateAuth('Host authorization expired while saving game state. Sign in again.')
          return
        }
        scheduleRetry()
      })
    }

    send()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
    }
  }, [hostReady, teams, doneQuestions, streaks, doublePoints, normalizedPlanIds, roundCatalog, reactionStats, invalidateAuth])

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

  function dismissBuzzAndResetMultiplier() {
    clearDoublePoints()
    handleDismiss()
  }

  function navigateToCursor(nextCursorId, options = {}) {
    const { clearBuzz = true, transitionRound = null, silent = false } = options
    const currentQuestionId = activeItem?.type === 'question' ? activeItem.id : null
    const nextItem = nextCursorId ? planCatalog.byId.get(nextCursorId) : null
    const nextQuestionId = nextItem?.type === 'question' ? nextItem.id : null
    if (currentQuestionId !== nextQuestionId) {
      setReactionStats((prev) => clearQuestionLastFromReactionStats(prev))
    }
    if (clearBuzz) {
      clearDoublePoints()
      handleDismiss()
    }
    navigate(nextCursorId, { transitionRound, silent })
  }

  function navigateWithReset(roundIndex, questionIndex = null) {
    if (questionIndex === null) {
      const introId = planCatalog.introIdByRoundIndex.get(roundIndex)
      if (!introId || !planIdSet.has(introId)) return
      navigateToCursor(introId, { transitionRound: roundCatalog[roundIndex] })
      return
    }
    const directId = questionItemIdFor(roundIndex, questionIndex, planCatalog)
    if (directId && planIdSet.has(directId)) {
      navigateToCursor(directId)
      return
    }
    const fallback = firstQuestionIdInRound(roundIndex, normalizedPlanIds, planCatalog)
    if (fallback) navigateToCursor(fallback)
  }

  function goBack() {
    dismissBuzzAndResetMultiplier()
    setLaunching(false)
    navigateToCursor(null, { clearBuzz: false, silent: true })
  }

  if (activeItem !== null) {
    const rIdx = activeRoundIndex
    const qIdx = activeQuestionIndex
    if (activeItem.type === 'round-intro') {
      return (
        <>
          <RoundIntroView
            rounds={roundCatalog}
            planCatalog={planCatalog}
            roundIndex={rIdx}
            doneQuestions={doneQuestions}
            onNavigate={navigateWithReset}
            onBack={goBack}
            onHalftime={() => setShowHalftime(true)}
            isRoundIncluded={(roundIndex) => plannedRoundIndexSet.has(roundIndex)}
            isQuestionIncluded={(roundIndex, questionIndex) => {
              const id = questionItemIdFor(roundIndex, questionIndex, planCatalog)
              return Boolean(id && planIdSet.has(id))
            }}
            getRoundDisplayLabel={getRoundDisplayLabel}
            getQuestionDisplayNumber={getQuestionDisplayNumber}
          />
          {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
          {transition && <RoundTransitionScreen round={transition} roundLabel={transitionRoundLabel} onDone={dismissTransition} />}
          <ReactionLeaderboardModal
            open={showReactionLeaderboard}
            rows={questionRaceRows}
            onClose={() => setShowReactionLeaderboard(false)}
          />
        </>
      )
    }

    return (
      <>
        <QuestionView
          key={activeItem.id}
          rounds={roundCatalog}
          planCatalog={planCatalog}
          buzzerUrl={buzzerUrl}
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
          onMarkDone={() => { clearDoublePoints(); markDone(activeItem.id) }}
          onNavigate={navigateWithReset}
          onBack={goBack}
          onNext={() => {
            const next = plannedItems[activePlanIndex + 1] || null
            if (!next) {
              setShowWinner(true)
              return
            }
            navigateToCursor(next.id, {
              transitionRound: next.type === 'round-intro' ? roundCatalog[next.roundIndex] : null,
            })
          }}
          onPrev={() => {
            const prev = plannedItems[activePlanIndex - 1] || null
            if (!prev) return
            navigateToCursor(prev.id, {
              transitionRound: prev.type === 'round-intro' ? roundCatalog[prev.roundIndex] : null,
            })
          }}
          onHalftime={() => setShowHalftime(true)}
          onWinner={() => setShowWinner(true)}
          onShowReactionLeaderboard={() => setShowReactionLeaderboard(true)}
          doublePoints={doublePoints}
          onToggleDouble={() => setDoublePoints(d => !d)}
          isRoundIncluded={(roundIndex) => plannedRoundIndexSet.has(roundIndex)}
          isQuestionIncluded={(roundIndex, questionIndex) => {
            const id = questionItemIdFor(roundIndex, questionIndex, planCatalog)
            return Boolean(id && planIdSet.has(id))
          }}
          getRoundDisplayLabel={getRoundDisplayLabel}
          getQuestionDisplayNumber={getQuestionDisplayNumber}
          getQuestionTotal={getQuestionTotal}
        />
        {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
        {showWinner   && <WinnerScreen   teams={teams} onDismiss={() => setShowWinner(false)} onClose={() => { setShowWinner(false); clearAll(); onReset() }} onTiebreaker={handleTiebreaker} />}
        {suddenDeath  && <SuddenDeathOverlay tiedTeams={tiedTeams} buzzWinner={buzzWinner} onAward={handleSuddenDeathAward} onWrong={handleSuddenDeathWrong} onCancel={handleSuddenDeathCancel} />}
        <ReactionLeaderboardModal
          open={showReactionLeaderboard}
          rows={questionRaceRows}
          onClose={() => setShowReactionLeaderboard(false)}
        />
      </>
    )
  }

  function handleStart() {
    if (!hasPlannedQuestions) {
      setNewGameError('No questions are selected in this game plan.')
      return
    }
    resetForNewGame()
    setLaunching(true)
    playGameStart()
    const firstItem = plannedItems[0] || null
    setTimeout(() => {
      if (!firstItem) return
      navigate(firstItem.id, {
        transitionRound: firstItem.type === 'round-intro' ? roundCatalog[firstItem.roundIndex] : null,
        silent: true,
      })
    }, 600)
  }

  function handleNewGame() {
    if (startingNewGame || endingSession) return
    if (!socket.connected) {
      setNewGameError('Not connected to server. Reconnect and try again.')
      return
    }
    setNewGameError('')
    setStartingNewGame(true)
    socket.timeout(4000).emit('host:new-game', (err, result) => {
      setStartingNewGame(false)
      if (err) {
        setNewGameError('Timed out starting a new game. Check your connection and try again.')
        return
      }
      if (!result?.ok) {
        if (result?.error === 'unauthorized') {
          invalidateAuth('Host authorization expired. Sign in again.')
          return
        }
        if (result?.error === 'session-not-found') {
          invalidateAuth('Session is no longer active. Sign in again.')
          return
        }
        setNewGameError('Could not start a new game. Please try again.')
        return
      }
      clearDoublePoints()
      handleDismiss()
      setReactionStats({})
      clearAll()
      onReset()
    })
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
          setShowEndSessionConfirm(false)
          setEndSessionError('')
          invalidateAuth('Host authorization expired. Sign in again.')
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
        rows={questionRaceRows}
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
        newGamePending={startingNewGame}
        newGameError={newGameError}
        onEndSession={handleEndSession}
        endingSession={endingSession}
        onStart={handleStart}
        startDisabled={!hasPlannedQuestions}
        armed={armed}
        buzzWinner={buzzWinner}
        onArm={handleArm}
        onDismiss={handleDismiss}
      />
    </>
  )
}
