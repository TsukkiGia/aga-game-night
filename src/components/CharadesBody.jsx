import { useState } from 'react'
import Timer from './Timer'

export default function CharadesBody({ question }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="qv-charades-wrap">
      <div className="qv-charades-label">Act this out</div>
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={() => setRevealed(true)}>Reveal Phrase ▼</button>
      ) : (
        <div className="qv-charades-phrase">{question.phrase}</div>
      )}
      <Timer seconds={90} />
    </div>
  )
}
