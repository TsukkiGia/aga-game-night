import { useState, useEffect } from 'react'
import Setup from './components/setup-flow/Setup'
import Scoreboard from './components/pages/Scoreboard'
import BuzzerPage from './components/pages/BuzzerPage'
import HostMobilePage from './components/pages/HostMobilePage'
import SessionGate from './components/setup-flow/SessionGate'
import SplashScreen from './components/setup-flow/SplashScreen'
import GameConfig from './components/setup-flow/GameConfig'
import GamePlanPreview from './components/setup-flow/GamePlanPreview'
import CompanionSetup from './components/setup-flow/CompanionSetup'
import SetupProgress from './components/setup-flow/SetupProgress'
import {
  TEAMS_KEY,
  GAME_PLAN_KEY,
  ROUND_CATALOG_KEY,
  GAMEPLAY_MODE_KEY,
  ACTIVE_QUESTION_KEY,
  PLAN_CONFIG_PENDING_KEY,
  PLAN_PREVIEW_PENDING_KEY,
  COMPANION_SETUP_PENDING_KEY,
  normalizeSavedTeams,
  getStorageItem,
  setStorageItem,
} from './core/storage'
import { normalizeGameplayMode, isHostlessMode } from './core/gameplayMode'
import { useWakeLock } from './hooks/useWakeLock'
import { playCrickets, playFaaah, playCorrectAnswer, playNani, playWhatTheHell, playShocked, playAirhorn, playBoo, playLaughter, playOkayy, playVeryWrong, playHelloGetDown, playOhNoNo, playDontProvokeMe, playWhyAreYouRunning } from './core/sounds'
import rounds from './core/rounds'
import { buildPlanCatalog, normalizePlanIdsWithRoundIntros } from './core/gamePlan'
import { normalizeRoundCatalog } from './core/roundCatalog'
import './App.css'

const pathname = window.location.pathname
const isBuzzerMode = pathname.startsWith('/buzz')
const isHostMobileMode = pathname.startsWith('/host-mobile')
function loadTeams() {
  try {
    const parsed = JSON.parse(getStorageItem(TEAMS_KEY) || 'null')
    return normalizeSavedTeams(parsed)
  } catch {
    return null
  }
}

function defaultRoundCatalog() {
  return normalizeRoundCatalog(rounds)
}

function loadRoundCatalog() {
  try {
    const parsed = JSON.parse(getStorageItem(ROUND_CATALOG_KEY) || 'null')
    const normalized = normalizeRoundCatalog(parsed)
    if (normalized.length > 0) return normalized
  } catch {
    // Ignore parse errors and fall back to defaults.
  }
  return defaultRoundCatalog()
}

function loadGamePlan(roundCatalog) {
  const catalog = buildPlanCatalog(Array.isArray(roundCatalog) && roundCatalog.length > 0 ? roundCatalog : defaultRoundCatalog())
  try {
    const parsed = JSON.parse(getStorageItem(GAME_PLAN_KEY) || 'null')
    return normalizePlanIdsWithRoundIntros(parsed, catalog, { fallbackToDefault: false })
  } catch {
    return normalizePlanIdsWithRoundIntros(null, catalog, { fallbackToDefault: false })
  }
}

function loadNeedsPlanConfig() {
  const raw = getStorageItem(PLAN_CONFIG_PENDING_KEY)
  if (raw === null) return false
  try {
    return JSON.parse(raw) === true
  } catch {
    const fallback = String(raw || '').trim().toLowerCase()
    return fallback === '1' || fallback === 'true'
  }
}

function loadNeedsCompanionSetup() {
  const raw = getStorageItem(COMPANION_SETUP_PENDING_KEY)
  if (raw === null) return false
  try {
    return JSON.parse(raw) === true
  } catch {
    const fallback = String(raw || '').trim().toLowerCase()
    return fallback === '1' || fallback === 'true'
  }
}

function loadNeedsPlanPreview() {
  const raw = getStorageItem(PLAN_PREVIEW_PENDING_KEY)
  if (raw === null) return false
  try {
    return JSON.parse(raw) === true
  } catch {
    const fallback = String(raw || '').trim().toLowerCase()
    return fallback === '1' || fallback === 'true'
  }
}

function loadGameplayMode() {
  const raw = getStorageItem(GAMEPLAY_MODE_KEY)
  if (raw === null) return normalizeGameplayMode(null)
  try {
    return normalizeGameplayMode(JSON.parse(raw))
  } catch {
    return normalizeGameplayMode(raw)
  }
}

const SETUP_STAGE = {
  TEAMS: 'teams',
  PLAN_CONFIG: 'plan-config',
  PLAN_PREVIEW: 'plan-preview',
  COMPANION: 'companion',
  READY: 'ready',
}

function resolveSetupStage({ hasTeams, pendingPlan, pendingPreview, pendingCompanion, hostlessMode }) {
  if (!hasTeams) return SETUP_STAGE.TEAMS
  if (pendingPlan) return SETUP_STAGE.PLAN_CONFIG
  if (pendingPreview) return SETUP_STAGE.PLAN_PREVIEW
  if (pendingCompanion && !hostlessMode) return SETUP_STAGE.COMPANION
  return SETUP_STAGE.READY
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false)
  const [session, setSession] = useState(null) // { code, pin } | null
  const [gameplayMode, setGameplayMode] = useState(() => loadGameplayMode())
  const [teams, setTeams] = useState(() => loadTeams())
  const [roundCatalog, setRoundCatalog] = useState(() => loadRoundCatalog())
  const [gamePlanIds, setGamePlanIds] = useState(() => loadGamePlan(loadRoundCatalog()))
  const [setupStage, setSetupStage] = useState(SETUP_STAGE.TEAMS)
  const hostlessModeActive = isHostlessMode(gameplayMode)
  useWakeLock(true)

  function setSetupStageAndPersist(nextStage, hostlessOverride = hostlessModeActive) {
    const normalizedStage = hostlessOverride && nextStage === SETUP_STAGE.COMPANION ? SETUP_STAGE.READY : nextStage
    setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(normalizedStage === SETUP_STAGE.PLAN_CONFIG))
    setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(normalizedStage === SETUP_STAGE.PLAN_PREVIEW))
    setStorageItem(
      COMPANION_SETUP_PENDING_KEY,
      JSON.stringify(normalizedStage === SETUP_STAGE.COMPANION && !hostlessOverride)
    )
    setSetupStage(normalizedStage)
  }

  let setupProgressStep = null
  if (session) {
    switch (setupStage) {
      case SETUP_STAGE.TEAMS:
        setupProgressStep = 1
        break
      case SETUP_STAGE.PLAN_CONFIG:
        setupProgressStep = 2
        break
      case SETUP_STAGE.PLAN_PREVIEW:
        setupProgressStep = 3
        break
      case SETUP_STAGE.COMPANION:
        setupProgressStep = hostlessModeActive ? null : 4
        break
      default:
        setupProgressStep = null
        break
    }
  }

  function navigateSetupStep(stepNumber) {
    if (!session || !Number.isInteger(stepNumber)) return
    switch (stepNumber) {
      case 1:
        setTeams(null)
        setSetupStageAndPersist(SETUP_STAGE.TEAMS)
        return
      case 2:
        if (!teams) return
        setSetupStageAndPersist(SETUP_STAGE.PLAN_CONFIG)
        return
      case 3:
        if (!teams) return
        setSetupStageAndPersist(SETUP_STAGE.PLAN_PREVIEW)
        return
      case 4:
        if (!teams) return
        setSetupStageAndPersist(SETUP_STAGE.COMPANION)
        return
      default:
        return
    }
  }

  useEffect(() => {
    if (isBuzzerMode || isHostMobileMode) return

    function onKey(e) {
      if (!e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target
      const tag = target?.tagName
      const isTypingField = target?.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
      if (isTypingField) return

      const key = String(e.key || '').toUpperCase()
      if (key === 'C') playCrickets()
      if (key === 'F') playFaaah()
      if (key === 'R') playCorrectAnswer()
      if (key === 'N') playNani()
      if (key === 'W') playWhatTheHell()
      if (key === 'S') playShocked()
      if (key === 'A') playAirhorn()
      if (key === 'B') playBoo()
      if (key === 'L') playLaughter()
      if (key === 'O') playOkayy()
      if (key === 'V') playVeryWrong()
      if (key === 'G') playHelloGetDown()
      if (key === 'H') playOhNoNo()
      if (key === 'D') playDontProvokeMe()
      if (key === 'Y') playWhyAreYouRunning()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleStart(newTeams) {
    setStorageItem(TEAMS_KEY, JSON.stringify(newTeams))
    setTeams(newTeams)
    const storedRoundCatalog = loadRoundCatalog()
    setRoundCatalog(storedRoundCatalog)
    setStorageItem(GAME_PLAN_KEY, JSON.stringify([]))
    setGamePlanIds([])
    setSetupStageAndPersist(SETUP_STAGE.PLAN_CONFIG)
  }

  function handlePlanConfirm(payload) {
    const nextPlanIds = Array.isArray(payload?.planIds) ? payload.planIds : []
    const nextRoundCatalog = normalizeRoundCatalog(payload?.roundCatalog)
    const effectiveRoundCatalog = nextRoundCatalog.length > 0 ? nextRoundCatalog : defaultRoundCatalog()
    setStorageItem(ROUND_CATALOG_KEY, JSON.stringify(effectiveRoundCatalog))
    setStorageItem(GAME_PLAN_KEY, JSON.stringify(nextPlanIds))
    // Fresh game config should always start from home, never reuse a stale cursor.
    setStorageItem(ACTIVE_QUESTION_KEY, JSON.stringify(null))
    setGamePlanIds(nextPlanIds)
    setRoundCatalog(effectiveRoundCatalog)
    setSetupStageAndPersist(SETUP_STAGE.PLAN_PREVIEW)
  }

  function handleSession(code, pin, incomingGameplayMode = null) {
    const restoredTeams = loadTeams()
    const normalizedGameplayMode = normalizeGameplayMode(incomingGameplayMode, loadGameplayMode())
    setSession({ code, pin })
    setGameplayMode(normalizedGameplayMode)
    setStorageItem(GAMEPLAY_MODE_KEY, JSON.stringify(normalizedGameplayMode))
    setTeams(restoredTeams)
    const storedRoundCatalog = loadRoundCatalog()
    setRoundCatalog(storedRoundCatalog)
    setGamePlanIds(loadGamePlan(storedRoundCatalog))
    const hasTeams = Boolean(restoredTeams)
    const pendingPlan = loadNeedsPlanConfig()
    const pendingPreview = loadNeedsPlanPreview()
    const pendingCompanion = loadNeedsCompanionSetup()
    setSetupStage(
      resolveSetupStage({
        hasTeams,
        pendingPlan,
        pendingPreview,
        pendingCompanion,
        hostlessMode: isHostlessMode(normalizedGameplayMode),
      })
    )
  }

  if (isBuzzerMode) return <BuzzerPage />
  if (isHostMobileMode) return <HostMobilePage />
  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />

  function renderMainContent() {
    if (!session) {
      return <SessionGate onSession={handleSession} />
    }
    switch (setupStage) {
      case SETUP_STAGE.TEAMS:
        return <Setup onStart={handleStart} />
      case SETUP_STAGE.PLAN_CONFIG:
        return (
          <GameConfig
            session={session}
            gameplayMode={gameplayMode}
            initialRoundCatalog={roundCatalog}
            initialPlanIds={gamePlanIds}
            onConfirm={handlePlanConfirm}
            onBack={() => {
              setTeams(null)
              setSetupStageAndPersist(SETUP_STAGE.TEAMS)
            }}
          />
        )
      case SETUP_STAGE.PLAN_PREVIEW:
        return (
          <GamePlanPreview
            roundCatalog={roundCatalog}
            teams={teams}
            onEditRound={() => setSetupStageAndPersist(SETUP_STAGE.PLAN_CONFIG)}
            onContinue={() => setSetupStageAndPersist(hostlessModeActive ? SETUP_STAGE.READY : SETUP_STAGE.COMPANION)}
            onBack={() => setSetupStageAndPersist(SETUP_STAGE.PLAN_CONFIG)}
          />
        )
      case SETUP_STAGE.COMPANION:
        if (hostlessModeActive) return null
        return (
          <CompanionSetup
            sessionCode={session?.code}
            backLabel="← Back"
            onContinue={() => setSetupStageAndPersist(SETUP_STAGE.READY)}
            onBack={() => setSetupStageAndPersist(SETUP_STAGE.PLAN_PREVIEW)}
          />
        )
      case SETUP_STAGE.READY:
      default:
        return (
          <Scoreboard
            teams={teams}
            gameplayMode={gameplayMode}
            onGameplayModeSync={(nextGameplayMode) => {
              const normalized = normalizeGameplayMode(nextGameplayMode, gameplayMode)
              setGameplayMode(normalized)
              setStorageItem(GAMEPLAY_MODE_KEY, JSON.stringify(normalized))
            }}
            initialRoundCatalog={roundCatalog}
            initialPlanIds={gamePlanIds}
            onReset={() => {
              setTeams(null)
              setSetupStageAndPersist(SETUP_STAGE.TEAMS)
            }}
            onEndSession={() => {
              setTeams(null)
              setSession(null)
              setSetupStageAndPersist(SETUP_STAGE.TEAMS)
            }}
          />
        )
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="kente-bar" />
        <div className="header-content">
          <div className="adinkra-left">⬡</div>
          <h1 className="app-title">Sankofa Showdown</h1>
          <div className="adinkra-right">⬡</div>
        </div>
        <div className="kente-bar thin" />
      </header>

      <main className="app-main">
        {setupProgressStep && (
          <SetupProgress
            steps={hostlessModeActive ? ['Teams', 'Game Plan', 'Preview'] : ['Teams', 'Game Plan', 'Preview', 'Companion']}
            current={setupProgressStep}
            onStepClick={navigateSetupStep}
          />
        )}
        {renderMainContent()}
      </main>

      <footer className="app-footer">
        <div className="kente-bar thin" />
        <div className="footer-symbols">◈ ◇ ◈ ◇ ◈ ◇ ◈ ◇ ◈</div>
      </footer>
    </div>
  )
}
