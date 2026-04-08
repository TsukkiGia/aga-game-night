import { useState } from 'react'

export default function Setup({ onStart }) {
  const [step, setStep] = useState('count') // 'count' | 'names'
  const [teamCount, setTeamCount] = useState(null)
  const [names, setNames] = useState([])

  const teamColors = ['ember', 'gold', 'forest', 'earth', 'indigo', 'rose', 'slate', 'sage']

  function handleCountSelect(n) {
    setTeamCount(n)
    setNames(Array(n).fill(''))
    setStep('names')
  }

  function handleNameChange(i, val) {
    setNames(prev => prev.map((name, idx) => idx === i ? val : name))
  }

  function handleStart() {
    const finalNames = names.map((n, i) => n.trim() || `Team ${i + 1}`)
    onStart(finalNames.map((name, i) => ({
      name,
      score: 0,
      color: teamColors[i],
    })))
  }

  return (
    <div className="setup-container">
      {step === 'count' ? (
        <div className="setup-step">
          <div className="setup-icon">🥁</div>
          <h2 className="setup-heading">How many teams?</h2>
          <p className="setup-sub">Choose between 2 and 8 teams to compete</p>
          <div className="team-count-grid">
            {[2, 3, 4, 5, 6, 7, 8].map(n => (
              <button
                key={n}
                className="count-btn"
                onClick={() => handleCountSelect(n)}
              >
                <span className="count-number">{n}</span>
                <span className="count-label">Teams</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="setup-step">
          <div className="setup-icon">✍️</div>
          <h2 className="setup-heading">Name Your Teams</h2>
          <p className="setup-sub">Give each team a name — or leave blank for defaults</p>
          <div className={`name-inputs${teamCount > 4 ? ' many' : ''}`}>
            {names.map((name, i) => (
              <div key={i} className={`name-input-row color-${teamColors[i]}`}>
                <div className="team-badge">{i + 1}</div>
                <input
                  className="team-name-input"
                  type="text"
                  value={name}
                  onChange={e => handleNameChange(i, e.target.value)}
                  placeholder={`Team ${i + 1}`}
                  maxLength={20}
                  autoFocus={i === 0}
                />
              </div>
            ))}
          </div>
          <div className="setup-actions">
            <button className="back-btn" onClick={() => setStep('count')}>← Back</button>
            <button className="start-btn" onClick={handleStart}>
              Begin Game →
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
