import { useState, useEffect } from 'react'
import Setup from './components/Setup'
import Scoreboard from './components/Scoreboard'
import BuzzerPage from './components/BuzzerPage'
import { TEAMS_KEY } from './storage'
import { playCrickets, playFaaah, playCorrectAnswer, playNani, playWhatTheHell, playShocked, playAirhorn, playBoo, playLaughter, playOkayy } from './sounds'
import './App.css'

const isBuzzerMode = window.location.pathname.startsWith('/buzz')

function loadTeams() {
  try { return JSON.parse(localStorage.getItem(TEAMS_KEY)) } catch { return null }
}

export default function App() {
  const [teams, setTeams] = useState(() => loadTeams())

  useEffect(() => {
    function onKey(e) {
      if (!e.shiftKey) return
      if (e.key === 'C') playCrickets()
      if (e.key === 'F') playFaaah()
      if (e.key === 'R') playCorrectAnswer()
      if (e.key === 'N') playNani()
      if (e.key === 'W') playWhatTheHell()
      if (e.key === 'S') playShocked()
      if (e.key === 'A') playAirhorn()
      if (e.key === 'B') playBoo()
      if (e.key === 'L') playLaughter()
      if (e.key === 'O') playOkayy()
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
          <h1 className="app-title">SCORE KEEPER</h1>
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
