import { useState } from 'react'
import Timer from './Timer'

export default function CharadesBody({ question }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="qv-charades-wrap">
      <div className="qv-charades-label">Guess the Phrase before time runs out</div>
      <Timer seconds={60} />
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={() => setRevealed(true)}>Reveal Phrase ▼</button>
      ) : (
        <div className="buzz-popup-answer">
          <div className="buzz-popup-answer-label">Phrase</div>
          <div className="buzz-popup-answer-text">{question.phrase}</div>
        </div>
      )}
    </div>
  )
}
