import { useState, useEffect } from 'react'
import Setup from './components/Setup'
import Scoreboard from './components/Scoreboard'
import BuzzerPage from './components/BuzzerPage'
import { TEAMS_KEY } from './storage'
import { useWakeLock } from './hooks/useWakeLock'
import { playCrickets, playFaaah, playCorrectAnswer, playNani, playWhatTheHell, playShocked, playAirhorn, playBoo, playLaughter, playOkayy } from './sounds'
import './App.css'

const isBuzzerMode = window.location.pathname.startsWith('/buzz')

function loadTeams() {
  try { return JSON.parse(localStorage.getItem(TEAMS_KEY)) } catch { return null }
}

export default function App() {
  const [teams, setTeams] = useState(() => loadTeams())
  useWakeLock(true)

  useEffect(() => {
    if (isBuzzerMode) return

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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function handleStart(newTeams) {
    localStorage.setItem(TEAMS_KEY, JSON.stringify(newTeams))
    setTeams(newTeams)
  }

  if (isBuzzerMode) {
    return <BuzzerPage />
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
        <div className="kente-bar" />
      </header>

      <main className="app-main">
        {!teams ? (
          <Setup onStart={handleStart} />
        ) : (
          <Scoreboard teams={teams} onReset={() => setTeams(null)} />
        )}
      </main>

      <footer className="app-footer">
        <div className="kente-bar thin" />
        <div className="footer-symbols">◈ ◇ ◈ ◇ ◈ ◇ ◈ ◇ ◈</div>
      </footer>
    </div>
  )
}
