import { useState } from 'react'

export default function SlangBody({ question }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="qv-slang-wrap">
      <div className="qv-slang-meta">{question.language} · {question.country}</div>
      <div className="qv-slang-term">{question.term}</div>
      <div className="qv-slang-sentence">"{question.sentence}"</div>
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={() => setRevealed(true)}>Reveal Answer ▼</button>
      ) : (
        <div className="buzz-popup-answer">
          <div className="buzz-popup-answer-label">Meaning</div>
          <div className="buzz-popup-answer-text">{question.meaning}</div>
        </div>
      )}
    </div>
  )
}
