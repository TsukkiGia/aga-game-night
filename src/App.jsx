import { useState } from 'react'
import Setup from './components/Setup'
import Scoreboard from './components/Scoreboard'
import BuzzerPage from './components/BuzzerPage'
import './App.css'

const isBuzzerMode = window.location.pathname.startsWith('/buzz')

export default function App() {
  const [teams, setTeams] = useState(null)

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
          <Setup onStart={setTeams} />
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
