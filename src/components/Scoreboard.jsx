import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import QuestionView from './QuestionView'
import RoundIntroView from './RoundIntroView'
import HalftimeScreen from './HalftimeScreen'
import WinnerScreen from './WinnerScreen'
import SuddenDeathOverlay from './SuddenDeathOverlay'
import RoundTransitionScreen from './RoundTransitionScreen'
import ReactionLeaderboardModal from './ReactionLeaderboardModal'
import StatsModal from './StatsModal'
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
import { useGamePlan } from '../hooks/useGamePlan'
import { useReactionStats } from '../hooks/useReactionStats'
import { useRuntimePersist } from '../hooks/useRuntimePersist'
import { useSessionActions } from '../hooks/useSessionActions'
import { clearAll } from '../storage'
import { playGameStart } from '../sounds'
import {
  normalizeDoneQuestionIds,
  resolveEffectivePlanForSync,
  normalizeCursorId,
  buildPlanCatalog,
  normalizePlanIdsWithRoundIntros,
  firstQuestionIdInRound,
  questionItemIdFor,
} from '../gamePlan'

const DEFAULT_ROUND_CATALOG = normalizeRoundCatalog(rounds)

export default function Scoreboard({ teams: initialTeams, initialPlanIds, initialRoundCatalog, onReset, onEndSession }) {
  const [roundCatalog, setRoundCatalog] = useState(() => {
    const normalized = normalizeRoundCatalog(initialRoundCatalog)
    return normalized.length > 0 ? normalized : DEFAULT_ROUND_CATALOG
  })
  const planCatalog = useMemo(() => buildPlanCatalog(roundCatalog), [roundCatalog])
  const [gamePlanIds, setGamePlanIds] = useState(() =>
    normalizePlanIdsWithRoundIntros(initialPlanIds, buildPlanCatalog(normalizeRoundCatalog(initialRoundCatalog).length > 0 ? normalizeRoundCatalog(initialRoundCatalog) : DEFAULT_ROUND_CATALOG), { fallbackToDefault: true })
  )

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
  } = useGameState(initialTeams, {
    onStreak: useCallback(({ teamIndex, streakCount }) => {
      socket.emit('host:streak', { teamIndex, streakCount })
    }, []),
    roundCatalog,
  })

  const { activeQuestion, transition, navigate, dismissTransition } = useNavigation()

  const {
    normalizedPlanIds,
    planIdSet,
    plannedItems,
    activeQuestionId,
    activeItem,
    activePlanIndex,
    activeLegacyPair,
    plannedRoundIndexSet,
    hasPlannedQuestions,
    planDisplay,
    getRoundDisplayLabel,
    getQuestionDisplayNumber,
    getQuestionTotal,
    transitionRoundLabel,
  } = useGamePlan({ gamePlanIds, planCatalog, roundCatalog, activeQuestion, transition })

  const {
    reactionStats,
    showStats,
    setShowStats,
    handleBuzzAttempt,
    questionRaceRows,
    clearQuestionLast,
    hydrateStats,
    resetStats,
  } = useReactionStats({ activeItem, planDisplay, roundCatalog })

  const [activeRoundIndex, activeQuestionIndex] = activeLegacyPair || [null, null]

  const [showHalftime, setShowHalftime] = useState(false)
  const [showWinner, setShowWinner] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [suddenDeath, setSuddenDeath] = useState(false)
  const [tiedTeams, setTiedTeams] = useState([])
  const [showHelp, setShowHelp] = useState(false)
  const [showReactionLeaderboard, setShowReactionLeaderboard] = useState(false)
  const [authForm, setAuthForm] = useState({ sessionCode: '', pin: '' })

  const runtimeHydratedRef = useRef(false)
  const [questionSidebarScrollTop, setQuestionSidebarScrollTop] = useState(0)

  const rememberQuestionSidebarScroll = useCallback((nextScrollTop) => {
    const parsed = Number(nextScrollTop)
    setQuestionSidebarScrollTop(Number.isFinite(parsed) && parsed >= 0 ? parsed : 0)
  }, [])

  const handleRuntimeSync = useCallback((serverState) => {
    const serverRoundCatalog = normalizeRoundCatalog(serverState?.roundCatalog)
    const effectiveRoundCatalog = serverRoundCatalog.length > 0
      ? serverRoundCatalog
      : (roundCatalog.length > 0 ? roundCatalog : DEFAULT_ROUND_CATALOG)
    const effectivePlanCatalog = buildPlanCatalog(effectiveRoundCatalog)
    const effectivePlan = resolveEffectivePlanForSync(serverState?.gamePlan, normalizedPlanIds, effectivePlanCatalog)

    setRoundCatalog(effectiveRoundCatalog)
    setGamePlanIds(effectivePlan)
    hydrateStats(serverState?.reactionStats)
    const normalizedDone = normalizeDoneQuestionIds(serverState?.doneQuestions, effectivePlanCatalog)
    hydrateFromServer({ ...serverState, doneQuestions: normalizedDone, roundCatalog: effectiveRoundCatalog })
    const nextCursor = normalizeCursorId(serverState?.hostQuestionCursor, effectivePlan, effectivePlanCatalog)
    navigate(nextCursor, { silent: true })
    runtimeHydratedRef.current = true
  }, [hydrateFromServer, hydrateStats, navigate, normalizedPlanIds, roundCatalog])

  const setupPayload = useMemo(() => ({
    gamePlan: normalizedPlanIds,
    roundCatalog,
  }), [normalizedPlanIds, roundCatalog])

  const { armed, buzzWinner, members, stealMode, hostReady, sessionCode, authState, submitAuth, handleArm, handleDismiss, handleWrongAndSteal, handleRearm, syncHostQuestion, timerControlSignal, invalidateAuth } = useGameSocket(
    initialTeams,
    { onBuzzAttempt: handleBuzzAttempt, onStateSync: handleRuntimeSync, setupPayload }
  )

  useRuntimePersist({
    hostReady,
    runtimeHydratedRef,
    teams,
    doneQuestions,
    streaks,
    doublePoints,
    normalizedPlanIds,
    roundCatalog,
    reactionStats,
    invalidateAuth,
  })

  const {
    startingNewGame,
    newGameError,
    endingSession,
    showEndSessionConfirm,
    setShowEndSessionConfirm,
    endSessionError,
    handleNewGame,
    handleEndSession,
    confirmEndSession,
  } = useSessionActions({
    invalidateAuth,
    clearDoublePoints,
    handleDismiss,
    resetStats,
    onReset,
    onEndSession,
  })

  useEffect(() => {
    if (activeQuestion === null) return
    if (activeQuestionId === null) { navigate(null, { silent: true }); return }
    if (activeQuestion !== activeQuestionId) navigate(activeQuestionId, { silent: true })
  }, [activeQuestion, activeQuestionId, navigate])

  useEffect(() => {
    syncHostQuestion(activeQuestionId)
  }, [activeQuestionId, hostReady, syncHostQuestion])

  useEffect(() => {
    if (!hostReady) runtimeHydratedRef.current = false
  }, [hostReady])

  useEffect(() => {
    if (!showHelp) return
    function onKeyDown(e) { if (e.key === 'Escape') setShowHelp(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showHelp])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { setShowReactionLeaderboard(false); return }
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      const tag = target?.tagName
      if (target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (String(e.key || '').toUpperCase() === 'T') {
        e.preventDefault()
        setShowReactionLeaderboard((open) => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const buzzerUrl = `${ENDPOINT || window.location.origin}/buzz${sessionCode ? `?s=${sessionCode}` : ''}`
  const hostCompanionUrl = `${ENDPOINT || window.location.origin}/host-mobile`

  function dismissBuzzAndResetMultiplier() {
    clearDoublePoints()
    handleDismiss()
  }

  function navigateToCursor(nextCursorId, options = {}) {
    const { clearBuzz = true, transitionRound = null, silent = false } = options
    const currentQuestionId = activeItem?.type === 'question' ? activeItem.id : null
    const nextItem = nextCursorId ? planCatalog.byId.get(nextCursorId) : null
    const nextQuestionId = nextItem?.type === 'question' ? nextItem.id : null
    if (currentQuestionId !== nextQuestionId) clearQuestionLast()
    if (clearBuzz) { clearDoublePoints(); handleDismiss() }
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
    if (directId && planIdSet.has(directId)) { navigateToCursor(directId); return }
    const fallback = firstQuestionIdInRound(roundIndex, normalizedPlanIds, planCatalog)
    if (fallback) navigateToCursor(fallback)
  }

  function goBack() {
    dismissBuzzAndResetMultiplier()
    setLaunching(false)
    navigateToCursor(null, { clearBuzz: false, silent: true })
  }

  function handleTiebreaker(winners) {
    setShowWinner(false)
    setTiedTeams(winners)
    setSuddenDeath(true)
    handleArm({ allowedTeamIndices: winners.map(w => w.originalIndex) })
  }

  function handleSuddenDeathAward(teamIndex) {
    adjust(teamIndex, 1)
    handleDismiss()
    setSuddenDeath(false)
    setShowWinner(true)
  }

  function handleSuddenDeathWrong() {
    handleRearm({ allowedTeamIndices: tiedTeams.map(w => w.originalIndex) })
  }

  function handleSuddenDeathCancel() {
    handleDismiss()
    setSuddenDeath(false)
    setTiedTeams([])
    setShowWinner(true)
  }

  function handleStart() {
    if (!hasPlannedQuestions) return
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

  if (activeItem !== null) {
    const rIdx = activeRoundIndex
    const qIdx = activeQuestionIndex
    const isRoundIncluded = (roundIndex) => plannedRoundIndexSet.has(roundIndex)
    const isQuestionIncluded = (roundIndex, questionIndex) => {
      const id = questionItemIdFor(roundIndex, questionIndex, planCatalog)
      return Boolean(id && planIdSet.has(id))
    }

    if (activeItem.type === 'round-intro') {
      return (
        <>
          <RoundIntroView
            rounds={roundCatalog}
            planCatalog={planCatalog}
            roundIndex={rIdx}
            doneQuestions={doneQuestions}
            teams={teams}
            streaks={streaks}
            onAdjust={adjust}
            onNavigate={navigateWithReset}
            onBack={goBack}
            onHalftime={() => setShowHalftime(true)}
            isRoundIncluded={isRoundIncluded}
            isQuestionIncluded={isQuestionIncluded}
            getRoundDisplayLabel={getRoundDisplayLabel}
            getQuestionDisplayNumber={getQuestionDisplayNumber}
            savedSidebarScrollTop={questionSidebarScrollTop}
            onRememberSidebarScroll={rememberQuestionSidebarScroll}
          />
          {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
          {transition && <RoundTransitionScreen round={transition} roundLabel={transitionRoundLabel} onDone={dismissTransition} />}
          <ReactionLeaderboardModal open={showReactionLeaderboard} rows={questionRaceRows} onClose={() => setShowReactionLeaderboard(false)} />
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
          onMarkDone={() => { clearDoublePoints(); markDone(activeItem.id) }}
          onNavigate={navigateWithReset}
          onBack={goBack}
          onNext={() => {
            const next = plannedItems[activePlanIndex + 1] || null
            if (!next) { setShowWinner(true); return }
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
          isRoundIncluded={isRoundIncluded}
          isQuestionIncluded={isQuestionIncluded}
          getRoundDisplayLabel={getRoundDisplayLabel}
          getQuestionDisplayNumber={getQuestionDisplayNumber}
          getQuestionTotal={getQuestionTotal}
          savedSidebarScrollTop={questionSidebarScrollTop}
          onRememberSidebarScroll={rememberQuestionSidebarScroll}
        />
        {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
        {showWinner && <WinnerScreen teams={teams} onDismiss={() => setShowWinner(false)} onClose={() => { setShowWinner(false); clearAll(); onReset() }} onTiebreaker={handleTiebreaker} onViewStats={() => setShowStats(true)} />}
        {showStats && <StatsModal reactionStats={reactionStats} onClose={() => setShowStats(false)} />}
        {suddenDeath && <SuddenDeathOverlay tiedTeams={tiedTeams} buzzWinner={buzzWinner} onAward={handleSuddenDeathAward} onWrong={handleSuddenDeathWrong} onCancel={handleSuddenDeathCancel} />}
        <ReactionLeaderboardModal open={showReactionLeaderboard} rows={questionRaceRows} onClose={() => setShowReactionLeaderboard(false)} />
      </>
    )
  }

  return (
    <>
      <HomeBuzzOverlay buzzWinner={buzzWinner} onDismiss={handleDismiss} />
      <HostHelpModal open={showHelp} onClose={() => setShowHelp(false)} hostCompanionUrl={hostCompanionUrl} />
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
      <ReactionLeaderboardModal open={showReactionLeaderboard} rows={questionRaceRows} onClose={() => setShowReactionLeaderboard(false)} />
      {showEndSessionConfirm && (
        <div className="help-overlay" onClick={() => !endingSession && setShowEndSessionConfirm(false)}>
          <div className="end-session-modal" onClick={(e) => e.stopPropagation()}>
            <div className="help-popup-tag">Confirm Action</div>
            <h2 className="end-session-title">End this session?</h2>
            <p className="end-session-copy">The session code will stop working and all players will disconnect.</p>
            {endSessionError && <div className="host-auth-error">{endSessionError}</div>}
            <div className="end-session-actions">
              <button className="back-btn" type="button" onClick={() => setShowEndSessionConfirm(false)} disabled={endingSession}>Cancel</button>
              <button className="home-end-session-btn end-session-confirm-btn" type="button" onClick={confirmEndSession} disabled={endingSession}>
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
