import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import QuestionView from '../gameplay/QuestionView'
import RoundIntroView from '../gameplay/RoundIntroView'
import HalftimeScreen from '../gameplay/HalftimeScreen'
import WinnerScreen from '../gameplay/WinnerScreen'
import SuddenDeathOverlay from '../gameplay/SuddenDeathOverlay'
import RoundTransitionScreen from '../gameplay/RoundTransitionScreen'
import ReactionLeaderboardModal from '../gameplay/ReactionLeaderboardModal'
import StatsModal from '../gameplay/StatsModal'
import HostHelpModal from '../home/HostHelpModal'
import HomeLobbyView from '../home/HomeLobbyView'
import HomeBuzzOverlay from '../home/HomeBuzzOverlay'
import ModalShell from '../ui/ModalShell'
import { ENDPOINT } from '../../core/config'
import { socket } from '../../core/socket'
import rounds from '../../core/rounds'
import { normalizeRoundCatalog } from '../../core/roundCatalog'
import { useGameState } from '../../hooks/useGameState'
import { useGameSocket } from '../../hooks/useGameSocket'
import { useNavigation } from '../../hooks/useNavigation'
import { useGamePlan } from '../../hooks/useGamePlan'
import { useReactionStats } from '../../hooks/useReactionStats'
import { useRuntimePersist } from '../../hooks/useRuntimePersist'
import { useSessionActions } from '../../hooks/useSessionActions'
import { clearAll } from '../../core/storage'
import { playGameStart, playCorrect } from '../../core/sounds'
import { normalizeGameplayMode, isHostlessMode, isRoundSupportedInMode, gameplayModeLabel } from '../../core/gameplayMode'
import {
  normalizeDoneQuestionIds,
  resolveEffectivePlanForSync,
  normalizeCursorId,
  buildPlanCatalog,
  normalizePlanIdsWithRoundIntros,
  firstQuestionIdInRound,
  questionItemIdFor,
} from '../../core/gamePlan'

const DEFAULT_ROUND_CATALOG = normalizeRoundCatalog(rounds)

export default function Scoreboard({
  teams: initialTeams,
  gameplayMode: initialGameplayMode = 'hosted',
  onGameplayModeSync = () => {},
  initialPlanIds,
  initialRoundCatalog,
  onReset,
  onEndSession,
}) {
  const [gameplayMode, setGameplayMode] = useState(() => normalizeGameplayMode(initialGameplayMode))
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
  const [hostlessAttemptFeed, setHostlessAttemptFeed] = useState([])
  const [hostlessCorrectEvent, setHostlessCorrectEvent] = useState(null)
  const [hostlessAnswerState, setHostlessAnswerState] = useState(null)
  const [hostlessTimeoutEvent, setHostlessTimeoutEvent] = useState(null)
  const [gameplayModeSwitching, setGameplayModeSwitching] = useState(false)
  const [gameplayModeError, setGameplayModeError] = useState('')
  const [pendingModeSwitch, setPendingModeSwitch] = useState(null)
  const [authForm, setAuthForm] = useState({ sessionCode: '', pin: '' })

  const runtimeHydratedRef = useRef(false)
  const hostlessRestorePlanRef = useRef(null)
  const lastCorrectSoundKeyRef = useRef('')
  const [questionSidebarScrollTop, setQuestionSidebarScrollTop] = useState(0)

  useEffect(() => {
    setGameplayMode(normalizeGameplayMode(initialGameplayMode))
  }, [initialGameplayMode])

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
    const syncedMode = normalizeGameplayMode(serverState?.gameplayMode, gameplayMode)
    const wasHostless = isHostlessMode(gameplayMode)
    const nextHostless = isHostlessMode(syncedMode)
    if (!wasHostless && nextHostless && !hostlessRestorePlanRef.current) {
      hostlessRestorePlanRef.current = [...normalizedPlanIds]
    } else if (!nextHostless) {
      hostlessRestorePlanRef.current = null
    }
    setGameplayMode(syncedMode)
    onGameplayModeSync(syncedMode)
    const nextCursor = normalizeCursorId(serverState?.hostQuestionCursor, effectivePlan, effectivePlanCatalog)
    navigate(nextCursor, { silent: true })
    runtimeHydratedRef.current = true
  }, [hydrateFromServer, hydrateStats, navigate, normalizedPlanIds, roundCatalog, gameplayMode, onGameplayModeSync])

  const setupPayload = useMemo(() => ({
    gamePlan: normalizedPlanIds,
    roundCatalog,
    gameplayMode,
  }), [normalizedPlanIds, roundCatalog, gameplayMode])

  const { armed, buzzWinner, gameplayMode: socketGameplayMode, answerState, members, stealMode, hostReady, sessionCode, authState, submitAuth, handleArm, handleDismiss, handleWrongAndSteal, handleRearm, syncHostQuestion, timerControlSignal, invalidateAuth } = useGameSocket(
    initialTeams,
    {
      onBuzzAttempt: handleBuzzAttempt,
      onStateSync: handleRuntimeSync,
      onAnswerAttempt: (payload) => {
        setHostlessAttemptFeed((prev) => [...prev, payload].slice(-8))
      },
      onAnswerCorrect: (payload) => {
        const soundKey = [
          String(payload?.questionId || ''),
          String(payload?.teamIndex ?? ''),
          String(payload?.timestamp ?? ''),
        ].join('|')
        if (soundKey && soundKey !== lastCorrectSoundKeyRef.current) {
          lastCorrectSoundKeyRef.current = soundKey
          playCorrect()
        }
        setHostlessCorrectEvent(payload)
        setHostlessTimeoutEvent(null)
      },
      onAnswerTimeout: (payload) => {
        setHostlessCorrectEvent(null)
        setHostlessTimeoutEvent(payload)
      },
      onAnswerState: (payload) => {
        setHostlessAnswerState(payload)
        if (payload?.status === 'open') {
          setHostlessTimeoutEvent(null)
          return
        }
        const revealedAnswer = String(payload?.revealedAnswer || '').trim()
        if (payload?.status === 'locked' && !payload?.winner && revealedAnswer) {
          setHostlessCorrectEvent(null)
          setHostlessTimeoutEvent((prev) => (
            prev?.questionId === payload.questionId && String(prev?.answer || '').trim() === revealedAnswer
              ? prev
              : { questionId: payload.questionId, answer: revealedAnswer }
          ))
        }
      },
      setupPayload,
    }
  )
  const effectiveGameplayMode = normalizeGameplayMode(gameplayMode, socketGameplayMode)
  const hostlessModeActive = isHostlessMode(effectiveGameplayMode)

  const commitGameplayModeSwitch = useCallback(async (nextMode, nextPlanIds, options = {}) => {
    if (!hostReady || gameplayModeSwitching) return false

    const nextModeNormalized = normalizeGameplayMode(nextMode, effectiveGameplayMode)
    const nextPlanSet = new Set(nextPlanIds)
    const nextDoneQuestions = [...doneQuestions].filter((id) => nextPlanSet.has(id))
    const nextCursorId = activeQuestionId && nextPlanSet.has(activeQuestionId)
      ? activeQuestionId
      : (nextPlanIds[0] || null)
    const payload = {
      teams: teams.map((team) => ({
        name: String(team.name || '').trim(),
        color: String(team.color || '').trim(),
        score: Number.isFinite(Number(team.score)) ? Number(team.score) : 0,
      })),
      doneQuestions: nextDoneQuestions,
      gameplayMode: nextModeNormalized,
      streaks: [...streaks],
      doublePoints: false,
      gamePlan: nextPlanIds,
      roundCatalog,
      reactionStats,
    }

    setGameplayModeSwitching(true)
    setGameplayModeError('')
    const result = await new Promise((resolve) => {
      socket.timeout(3000).emit('host:runtime:update', payload, (err, ack) => {
        if (err) resolve({ ok: false, error: 'timeout' })
        else resolve(ack || { ok: false, error: 'server-error' })
      })
    })

    if (!result?.ok) {
      if (result?.error === 'unauthorized') {
        invalidateAuth('Host authorization expired while switching gameplay mode. Sign in again.')
      } else {
        setGameplayModeError('Could not switch gameplay mode right now. Try again.')
      }
      setGameplayModeSwitching(false)
      return false
    }

    setGamePlanIds(nextPlanIds)
    clearDoublePoints()
    setHostlessAttemptFeed([])
    setHostlessCorrectEvent(null)
    setHostlessAnswerState(null)
    setHostlessTimeoutEvent(null)
    if (isHostlessMode(nextModeNormalized)) {
      hostlessRestorePlanRef.current = Array.isArray(options.restorePlanIds) && options.restorePlanIds.length > 0
        ? [...options.restorePlanIds]
        : null
    } else {
      hostlessRestorePlanRef.current = null
    }
    setGameplayMode(nextModeNormalized)
    onGameplayModeSync(nextModeNormalized)

    if (activeItem !== null) {
      const nextItem = nextCursorId ? planCatalog.byId.get(nextCursorId) : null
      navigate(nextCursorId, {
        silent: true,
        transitionRound: nextItem?.type === 'round-intro' ? roundCatalog[nextItem.roundIndex] : null,
      })
    }

    setGameplayModeSwitching(false)
    return true
  }, [
    hostReady,
    gameplayModeSwitching,
    effectiveGameplayMode,
    doneQuestions,
    activeQuestionId,
    teams,
    streaks,
    roundCatalog,
    reactionStats,
    clearDoublePoints,
    invalidateAuth,
    setGamePlanIds,
    onGameplayModeSync,
    activeItem,
    planCatalog,
    navigate,
  ])

  const requestGameplayModeSwitch = useCallback((rawNextMode) => {
    if (!hostReady) {
      setGameplayModeError('Host connection is not ready yet. Sign in again, then retry.')
      return
    }
    const nextMode = normalizeGameplayMode(rawNextMode, effectiveGameplayMode)
    if (nextMode === effectiveGameplayMode || gameplayModeSwitching) return

    const unsupportedRoundNames = new Set()
    let nextPlanIds = normalizedPlanIds
    let restorePlanIds = null
    if (isHostlessMode(nextMode)) {
      nextPlanIds = normalizedPlanIds.filter((id) => {
        const item = planCatalog.byId.get(id)
        if (!item) return false
        const round = roundCatalog[item.roundIndex]
        const supported = isRoundSupportedInMode(round?.type, nextMode)
        if (!supported && round?.name) unsupportedRoundNames.add(String(round.name))
        return supported
      })
      const hasHostlessQuestion = nextPlanIds.some((id) => planCatalog.byId.get(id)?.type === 'question')
      if (!hasHostlessQuestion) {
        setGameplayModeError('No host-less compatible questions are available in this run of show.')
        return
      }
      if (nextPlanIds.length !== normalizedPlanIds.length) restorePlanIds = normalizedPlanIds
    } else if (Array.isArray(hostlessRestorePlanRef.current) && hostlessRestorePlanRef.current.length > 0) {
      const restoredPlanIds = normalizePlanIdsWithRoundIntros(hostlessRestorePlanRef.current, planCatalog, { fallbackToDefault: false })
      if (restoredPlanIds.length > 0) nextPlanIds = restoredPlanIds
    }

    const pending = {
      nextMode,
      nextPlanIds,
      restorePlanIds,
      unsupportedRoundNames: [...unsupportedRoundNames],
      isDuringQuestion: activeItem !== null,
    }
    if (pending.isDuringQuestion || pending.unsupportedRoundNames.length > 0) {
      setPendingModeSwitch(pending)
      return
    }
    void commitGameplayModeSwitch(pending.nextMode, pending.nextPlanIds, { restorePlanIds: pending.restorePlanIds })
  }, [
    hostReady,
    effectiveGameplayMode,
    gameplayModeSwitching,
    normalizedPlanIds,
    planCatalog,
    roundCatalog,
    activeItem,
    commitGameplayModeSwitch,
  ])

  const cancelPendingModeSwitch = useCallback(() => {
    if (gameplayModeSwitching) return
    setPendingModeSwitch(null)
  }, [gameplayModeSwitching])

  const confirmPendingModeSwitch = useCallback(() => {
    if (!pendingModeSwitch) return
    const { nextMode, nextPlanIds, restorePlanIds } = pendingModeSwitch
    setPendingModeSwitch(null)
    void commitGameplayModeSwitch(nextMode, nextPlanIds, { restorePlanIds })
  }, [pendingModeSwitch, commitGameplayModeSwitch])

  const gameplayModeSwitchModal = pendingModeSwitch && (
    <ModalShell
      onClose={cancelPendingModeSwitch}
      closeOnOverlayClick={!gameplayModeSwitching}
      dialogClassName="end-session-modal"
    >
      <div className="help-popup-tag">Switch Gameplay Mode</div>
      <h2 className="end-session-title">{`Switch to ${gameplayModeLabel(pendingModeSwitch.nextMode)} mode?`}</h2>
      <p className="end-session-copy">
        {pendingModeSwitch.isDuringQuestion
          ? 'This will reset live buzz/answer state for the current question before continuing.'
          : 'This updates how players participate in upcoming questions.'}
      </p>
      {pendingModeSwitch.unsupportedRoundNames.length > 0 && (
        <p className="end-session-copy">
          {`Unsupported in Host-less and will be skipped: ${pendingModeSwitch.unsupportedRoundNames.join(', ')}`}
        </p>
      )}
      {gameplayModeError && <div className="host-auth-error">{gameplayModeError}</div>}
      <div className="end-session-actions">
        <button
          className="back-btn"
          type="button"
          onClick={cancelPendingModeSwitch}
          disabled={gameplayModeSwitching}
        >
          {`Stay ${gameplayModeLabel(effectiveGameplayMode)}`}
        </button>
        <button
          className="start-btn host-auth-submit-btn"
          type="button"
          onClick={confirmPendingModeSwitch}
          disabled={gameplayModeSwitching}
        >
          {gameplayModeSwitching
            ? 'Switching…'
            : (pendingModeSwitch.unsupportedRoundNames.length > 0
                ? 'Switch & Skip Unsupported Rounds'
                : 'Switch Mode')}
        </button>
      </div>
    </ModalShell>
  )

  useEffect(() => {
    const questionId = String(answerState?.questionId || hostlessAnswerState?.questionId || '')
    if (!questionId) return
    setHostlessAttemptFeed([])
    setHostlessCorrectEvent(null)
    setHostlessTimeoutEvent(null)
  }, [answerState?.questionId, hostlessAnswerState?.questionId])

  useRuntimePersist({
    hostReady,
    runtimeHydratedRef,
    teams,
    gameplayMode: effectiveGameplayMode,
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
    if (!hostlessModeActive) return
    setShowReactionLeaderboard(false)
    setShowStats(false)
  }, [hostlessModeActive, setShowStats])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { setShowReactionLeaderboard(false); return }
      if (hostlessModeActive) return
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
  }, [hostlessModeActive])

  const buzzerUrl = `${ENDPOINT || window.location.origin}/buzz${sessionCode ? `?s=${sessionCode}` : ''}`
  const hostCompanionUrl = `${ENDPOINT || window.location.origin}/host-mobile`

  function dismissBuzzAndResetMultiplier() {
    clearDoublePoints()
    if (!hostlessModeActive) handleDismiss()
  }

  function navigateToCursor(nextCursorId, options = {}) {
    const { clearBuzz = true, transitionRound = null, silent = false } = options
    const currentQuestionId = activeItem?.type === 'question' ? activeItem.id : null
    const nextItem = nextCursorId ? planCatalog.byId.get(nextCursorId) : null
    const nextQuestionId = nextItem?.type === 'question' ? nextItem.id : null
    if (currentQuestionId !== nextQuestionId) clearQuestionLast()
    if (clearBuzz) {
      clearDoublePoints()
      if (!hostlessModeActive) handleDismiss()
    }
    setHostlessAttemptFeed([])
    setHostlessCorrectEvent(null)
    setHostlessTimeoutEvent(null)
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
    setHostlessAttemptFeed([])
    setHostlessCorrectEvent(null)
    setHostlessTimeoutEvent(null)
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
          {!hostlessModeActive && (
            <ReactionLeaderboardModal open={showReactionLeaderboard} rows={questionRaceRows} onClose={() => setShowReactionLeaderboard(false)} />
          )}
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
          onTimerExpired={(questionId) => {
            const fallbackQuestionId = activeItem?.type === 'question' ? activeItem.id : ''
            const safeQuestionId = String(questionId || fallbackQuestionId || '').trim()
            if (safeQuestionId && fallbackQuestionId && safeQuestionId !== fallbackQuestionId) {
              return { accepted: false, reason: 'stale-local-question-id' }
            }

            socket.timeout(4000).emit(
              'host:timer:expired',
              safeQuestionId ? { questionId: safeQuestionId } : {},
              (err, ack) => {
                if (err) {
                  console.warn('[host:timer:expired] ack timeout/error', { safeQuestionId, err: String(err?.message || err || 'timeout') })
                  return
                }
                if (ack?.error === 'unauthorized') {
                  invalidateAuth('Host authorization expired. Sign in again.')
                  return
                }
                if (!(ack?.ok && ack?.accepted !== false)) {
                  console.warn('[host:timer:expired] not accepted', { safeQuestionId, ack })
                }
              }
            )

            return { accepted: true, reason: 'local-immediate' }
          }}
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
          pauseTimers={showHalftime}
          onShowReactionLeaderboard={() => {
            if (hostlessModeActive) return
            setShowReactionLeaderboard(true)
          }}
          doublePoints={doublePoints}
          onToggleDouble={() => setDoublePoints(d => !d)}
          gameplayMode={effectiveGameplayMode}
          answerState={answerState || hostlessAnswerState}
          hostlessAttemptFeed={hostlessAttemptFeed}
          hostlessCorrectEvent={hostlessCorrectEvent}
          hostlessTimeoutEvent={hostlessTimeoutEvent}
          onDismissHostlessCorrect={() => setHostlessCorrectEvent(null)}
          onDismissHostlessTimeout={() => setHostlessTimeoutEvent(null)}
          isRoundIncluded={isRoundIncluded}
          isQuestionIncluded={isQuestionIncluded}
          getRoundDisplayLabel={getRoundDisplayLabel}
          getQuestionDisplayNumber={getQuestionDisplayNumber}
          getQuestionTotal={getQuestionTotal}
          savedSidebarScrollTop={questionSidebarScrollTop}
          onRememberSidebarScroll={rememberQuestionSidebarScroll}
        />
        {showHalftime && <HalftimeScreen teams={teams} onClose={() => setShowHalftime(false)} />}
        {showWinner && (
          <WinnerScreen
            teams={teams}
            onDismiss={() => setShowWinner(false)}
            onClose={() => { setShowWinner(false); clearAll(); onReset() }}
            onTiebreaker={handleTiebreaker}
            onViewStats={hostlessModeActive ? null : (() => setShowStats(true))}
          />
        )}
        {!hostlessModeActive && showStats && <StatsModal reactionStats={reactionStats} onClose={() => setShowStats(false)} />}
        {suddenDeath && <SuddenDeathOverlay tiedTeams={tiedTeams} buzzWinner={buzzWinner} onAward={handleSuddenDeathAward} onWrong={handleSuddenDeathWrong} onCancel={handleSuddenDeathCancel} />}
        {!hostlessModeActive && (
          <ReactionLeaderboardModal open={showReactionLeaderboard} rows={questionRaceRows} onClose={() => setShowReactionLeaderboard(false)} />
        )}
      </>
    )
  }

  return (
    <>
      <HomeBuzzOverlay buzzWinner={buzzWinner} onDismiss={handleDismiss} />
      <HostHelpModal open={showHelp} onClose={() => setShowHelp(false)} hostCompanionUrl={hostCompanionUrl} />
      {authState.required && (
        <ModalShell onClose={() => {}} closeOnOverlayClick={false} dialogClassName="host-auth-modal">
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
        </ModalShell>
      )}
      {!hostlessModeActive && (
        <ReactionLeaderboardModal open={showReactionLeaderboard} rows={questionRaceRows} onClose={() => setShowReactionLeaderboard(false)} />
      )}
      {showEndSessionConfirm && (
        <ModalShell
          onClose={() => { if (!endingSession) setShowEndSessionConfirm(false) }}
          closeOnOverlayClick={!endingSession}
          dialogClassName="end-session-modal"
        >
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
        </ModalShell>
      )}
      {gameplayModeSwitchModal}
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
        gameplayMode={effectiveGameplayMode}
        onGameplayModeChange={requestGameplayModeSwitch}
        gameplayModeSwitching={gameplayModeSwitching}
        gameplayModeError={gameplayModeError}
      />
    </>
  )
}
