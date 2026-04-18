import { useState, useEffect, useMemo } from 'react'
import Setup from './components/Setup'
import Scoreboard from './components/Scoreboard'
import BuzzerPage from './components/BuzzerPage'
import HostMobilePage from './components/HostMobilePage'
import SessionGate from './components/SessionGate'
import SplashScreen from './components/SplashScreen'
import GameConfig from './components/GameConfig'
import GamePlanPreview from './components/GamePlanPreview'
import CompanionSetup from './components/CompanionSetup'
import SetupProgress from './components/SetupProgress'
import {
  TEAMS_KEY,
  GAME_PLAN_KEY,
  ROUND_CATALOG_KEY,
  ACTIVE_QUESTION_KEY,
  PLAN_CONFIG_PENDING_KEY,
  PLAN_PREVIEW_PENDING_KEY,
  COMPANION_SETUP_PENDING_KEY,
  normalizeSavedTeams,
  getStorageItem,
  setStorageItem,
} from './storage'
import { useWakeLock } from './hooks/useWakeLock'
import { playCrickets, playFaaah, playCorrectAnswer, playNani, playWhatTheHell, playShocked, playAirhorn, playBoo, playLaughter, playOkayy, playVeryWrong, playHelloGetDown, playOhNoNo, playDontProvokeMe, playWhyAreYouRunning } from './sounds'
import rounds from './rounds'
import { buildPlanCatalog, normalizePlanIdsWithRoundIntros } from './gamePlan'
import { normalizeRoundCatalog } from './roundCatalog'
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

export default function App() {
  const [splashDone, setSplashDone] = useState(false)
  const [session, setSession] = useState(null) // { code, pin } | null
  const [teams, setTeams] = useState(() => loadTeams())
  const [roundCatalog, setRoundCatalog] = useState(() => loadRoundCatalog())
  const [gamePlanIds, setGamePlanIds] = useState(() => loadGamePlan(loadRoundCatalog()))
  const [needsPlanConfig, setNeedsPlanConfig] = useState(() => loadNeedsPlanConfig())
  const [needsPlanPreview, setNeedsPlanPreview] = useState(() => loadNeedsPlanPreview())
  const [needsCompanionSetup, setNeedsCompanionSetup] = useState(() => loadNeedsCompanionSetup())
  useWakeLock(true)

  const setupProgressStep = useMemo(() => {
    if (!session) return null
    if (!teams) return 1
    if (needsPlanConfig) return 2
    if (needsPlanPreview) return 3
    if (needsCompanionSetup) return 4
    return null
  }, [session, teams, needsPlanConfig, needsPlanPreview, needsCompanionSetup])

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
    setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(true))
    setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(false))
    setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
    setNeedsPlanConfig(true)
    setNeedsPlanPreview(false)
    setNeedsCompanionSetup(false)
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
    setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(false))
    setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(true))
    setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
    setNeedsPlanConfig(false)
    setNeedsPlanPreview(true)
    setNeedsCompanionSetup(false)
  }

  function handleSession(code, pin) {
    const restoredTeams = loadTeams()
    setSession({ code, pin })
    setTeams(restoredTeams)
    const storedRoundCatalog = loadRoundCatalog()
    setRoundCatalog(storedRoundCatalog)
    setGamePlanIds(loadGamePlan(storedRoundCatalog))
    const hasTeams = Boolean(restoredTeams)
    const pendingPlan = loadNeedsPlanConfig()
    const pendingPreview = loadNeedsPlanPreview()
    const pendingCompanion = loadNeedsCompanionSetup()
    setNeedsPlanConfig(hasTeams && pendingPlan)
    setNeedsPlanPreview(hasTeams && !pendingPlan && pendingPreview)
    setNeedsCompanionSetup(hasTeams && !pendingPlan && !pendingPreview && pendingCompanion)
  }

  if (isBuzzerMode) return <BuzzerPage />
  if (isHostMobileMode) return <HostMobilePage />
  if (!splashDone) return <SplashScreen onDone={() => setSplashDone(true)} />

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
            steps={['Teams', 'Game Plan', 'Preview', 'Companion']}
            current={setupProgressStep}
          />
        )}
        {!session ? (
          <SessionGate onSession={handleSession} />
        ) : !teams ? (
          <Setup onStart={handleStart} />
        ) : needsPlanConfig ? (
          <GameConfig
            session={session}
            initialRoundCatalog={roundCatalog}
            initialPlanIds={gamePlanIds}
            onConfirm={handlePlanConfirm}
            onBack={() => {
              setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(false))
              setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(false))
              setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
              setNeedsPlanConfig(false)
              setNeedsPlanPreview(false)
              setNeedsCompanionSetup(false)
              setTeams(null)
            }}
          />
        ) : needsPlanPreview ? (
          <GamePlanPreview
            roundCatalog={roundCatalog}
            onContinue={() => {
              setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(false))
              setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(true))
              setNeedsPlanPreview(false)
              setNeedsCompanionSetup(true)
            }}
            onBack={() => {
              setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(true))
              setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(false))
              setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
              setNeedsPlanConfig(true)
              setNeedsPlanPreview(false)
              setNeedsCompanionSetup(false)
            }}
          />
        ) : needsCompanionSetup ? (
          <CompanionSetup
            sessionCode={session?.code}
            backLabel="← Back to Preview"
            onContinue={() => {
              setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
              setNeedsCompanionSetup(false)
            }}
            onBack={() => {
              setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(false))
              setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(true))
              setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
              setNeedsPlanConfig(false)
              setNeedsPlanPreview(true)
              setNeedsCompanionSetup(false)
            }}
          />
        ) : (
          <Scoreboard
            teams={teams}
            initialRoundCatalog={roundCatalog}
            initialPlanIds={gamePlanIds}
            onReset={() => {
              setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(false))
              setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(false))
              setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
              setTeams(null)
              const storedRoundCatalog = loadRoundCatalog()
              setRoundCatalog(storedRoundCatalog)
              setGamePlanIds(loadGamePlan(storedRoundCatalog))
              setNeedsPlanPreview(false)
              setNeedsCompanionSetup(false)
            }}
            onEndSession={() => {
              setStorageItem(PLAN_CONFIG_PENDING_KEY, JSON.stringify(false))
              setStorageItem(PLAN_PREVIEW_PENDING_KEY, JSON.stringify(false))
              setStorageItem(COMPANION_SETUP_PENDING_KEY, JSON.stringify(false))
              setTeams(null)
              setSession(null)
              const storedRoundCatalog = loadRoundCatalog()
              setRoundCatalog(storedRoundCatalog)
              setGamePlanIds(loadGamePlan(storedRoundCatalog))
              setNeedsPlanPreview(false)
              setNeedsCompanionSetup(false)
            }}
          />
        )}
      </main>

      <footer className="app-footer">
        <div className="kente-bar thin" />
        <div className="footer-symbols">◈ ◇ ◈ ◇ ◈ ◇ ◈ ◇ ◈</div>
      </footer>
    </div>
  )
}
