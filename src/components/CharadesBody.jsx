import { useState } from 'react'
import Timer from './Timer'

export default function CharadesBody({ question }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="qv-charades-wrap">
      <div className="qv-charades-label">Guess the Phrase before time runs out</div>
      <Timer seconds={90} />
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={() => setRevealed(true)}>Reveal Phrase ▼</button>
      ) : (
        <div className="qv-charades-phrase">{question.phrase}</div>
      )}
    </div>
  )
}
