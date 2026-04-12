import { useState, useEffect } from 'react'
import Setup from './components/Setup'
import Scoreboard from './components/Scoreboard'
import BuzzerPage from './components/BuzzerPage'
import HostMobilePage from './components/HostMobilePage'
import SessionGate from './components/SessionGate'
import SplashScreen from './components/SplashScreen'
import GameConfig from './components/GameConfig'
import { TEAMS_KEY, GAME_PLAN_KEY, ROUND_CATALOG_KEY, ACTIVE_QUESTION_KEY, normalizeSavedTeams, getStorageItem, setStorageItem } from './storage'
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
    return normalizePlanIdsWithRoundIntros(parsed, catalog, { fallbackToDefault: true })
  } catch {
    return normalizePlanIdsWithRoundIntros(null, catalog, { fallbackToDefault: true })
  }
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false)
  const [session, setSession] = useState(null) // { code, pin } | null
  const [teams, setTeams] = useState(() => loadTeams())
  const [roundCatalog, setRoundCatalog] = useState(() => loadRoundCatalog())
  const [gamePlanIds, setGamePlanIds] = useState(() => loadGamePlan(loadRoundCatalog()))
  const [needsPlanConfig, setNeedsPlanConfig] = useState(false)
  useWakeLock(true)

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
    setGamePlanIds(loadGamePlan(storedRoundCatalog))
    setNeedsPlanConfig(true)
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
    setNeedsPlanConfig(false)
  }

  function handleSession(code, pin) {
    setSession({ code, pin })
    setTeams(loadTeams())
    const storedRoundCatalog = loadRoundCatalog()
    setRoundCatalog(storedRoundCatalog)
    setGamePlanIds(loadGamePlan(storedRoundCatalog))
    setNeedsPlanConfig(false)
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
              setNeedsPlanConfig(false)
              setTeams(null)
            }}
          />
        ) : (
          <Scoreboard
            teams={teams}
            initialRoundCatalog={roundCatalog}
            initialPlanIds={gamePlanIds}
            onReset={() => {
              setTeams(null)
              const storedRoundCatalog = loadRoundCatalog()
              setRoundCatalog(storedRoundCatalog)
              setGamePlanIds(loadGamePlan(storedRoundCatalog))
            }}
            onEndSession={() => {
              setTeams(null)
              setSession(null)
              const storedRoundCatalog = loadRoundCatalog()
              setRoundCatalog(storedRoundCatalog)
              setGamePlanIds(loadGamePlan(storedRoundCatalog))
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
