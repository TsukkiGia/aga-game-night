import { useState, useEffect } from 'react'
import Setup from './components/Setup'
import Scoreboard from './components/Scoreboard'
import BuzzerPage from './components/BuzzerPage'
import HostMobilePage from './components/HostMobilePage'
import SessionGate from './components/SessionGate'
import SplashScreen from './components/SplashScreen'
import GameConfig from './components/GameConfig'
import { TEAMS_KEY, GAME_PLAN_KEY, ACTIVE_QUESTION_KEY, normalizeSavedTeams, getStorageItem, setStorageItem } from './storage'
import { useWakeLock } from './hooks/useWakeLock'
import { playCrickets, playFaaah, playCorrectAnswer, playNani, playWhatTheHell, playShocked, playAirhorn, playBoo, playLaughter, playOkayy, playVeryWrong, playHelloGetDown, playOhNoNo, playDontProvokeMe, playWhyAreYouRunning } from './sounds'
import rounds from './rounds'
import { buildPlanCatalog, normalizePlanIdsWithRoundIntros } from './gamePlan'
import './App.css'

const pathname = window.location.pathname
const isBuzzerMode = pathname.startsWith('/buzz')
const isHostMobileMode = pathname.startsWith('/host-mobile')
const PLAN_CATALOG = buildPlanCatalog(rounds)


function loadTeams() {
  try {
    const parsed = JSON.parse(getStorageItem(TEAMS_KEY) || 'null')
    return normalizeSavedTeams(parsed)
  } catch {
    return null
  }
}

function loadGamePlan() {
  try {
    const parsed = JSON.parse(getStorageItem(GAME_PLAN_KEY) || 'null')
    return normalizePlanIdsWithRoundIntros(parsed, PLAN_CATALOG, { fallbackToDefault: true })
  } catch {
    return normalizePlanIdsWithRoundIntros(null, PLAN_CATALOG, { fallbackToDefault: true })
  }
}

export default function App() {
  const [splashDone, setSplashDone] = useState(false)
  const [session, setSession] = useState(null) // { code, pin } | null
  const [teams, setTeams] = useState(() => loadTeams())
  const [gamePlanIds, setGamePlanIds] = useState(() => loadGamePlan())
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
    setGamePlanIds(loadGamePlan())
    setNeedsPlanConfig(true)
  }

  function handlePlanConfirm(nextPlanIds) {
    setStorageItem(GAME_PLAN_KEY, JSON.stringify(nextPlanIds))
    // Fresh game config should always start from home, never reuse a stale cursor.
    setStorageItem(ACTIVE_QUESTION_KEY, JSON.stringify(null))
    setGamePlanIds(nextPlanIds)
    setNeedsPlanConfig(false)
  }

  function handleSession(code, pin) {
    setSession({ code, pin })
    setTeams(loadTeams())
    setGamePlanIds(loadGamePlan())
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
            initialPlanIds={gamePlanIds}
            onReset={() => {
              setTeams(null)
              setGamePlanIds(loadGamePlan())
            }}
            onEndSession={() => {
              setTeams(null)
              setSession(null)
              setGamePlanIds(loadGamePlan())
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
