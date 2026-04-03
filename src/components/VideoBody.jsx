import { useState, useEffect, useRef } from 'react'
import { playTransition } from '../sounds'

export default function VideoBody({ question, paused }) {
  const videoRef = useRef(null)
  const [revealed, setRevealed] = useState(false)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (paused) el.pause()
  }, [paused])

  return (
    <div className="qv-video-wrap">
      <video ref={videoRef} className="qv-video" src={`/videos/${question.video}`} controls />
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={() => { playTransition(); setRevealed(true) }}>Reveal Answer ▼</button>
      ) : (
        <div className="buzz-popup-answer">
          <div className="buzz-popup-answer-label">Answer</div>
          <div className="buzz-popup-answer-text">{question.answer}</div>
          {question.explanation && (
            <div className="buzz-popup-answer-explanation">{question.explanation}</div>
          )}
        </div>
      )}
    </div>
  )
}
