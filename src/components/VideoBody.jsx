import { useState } from 'react'

export default function VideoBody({ question }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="qv-video-wrap">
      <video className="qv-video" src={`/videos/${question.video}`} controls />
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={() => setRevealed(true)}>Reveal Answer ▼</button>
      ) : (
        <div className="qv-answer-card">
          <div className="qv-answer-label">Answer</div>
          <div className="qv-answer-text">{question.answer || '(add answer to rounds.js)'}</div>
          {question.explanation && (
            <>
              <div className="qv-answer-label" style={{ marginTop: 12 }}>Explanation</div>
              <div className="qv-answer-explanation">{question.explanation}</div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
