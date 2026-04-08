import { useState, useEffect, useRef } from 'react'
import { playTransition } from '../sounds'
import { DEV_BUCKET_URL } from '../config'

export default function VideoBody({ question, paused }) {
  const videoRef = useRef(null)
  const [revealed, setRevealed] = useState(false)
  const videoPath = String(question.video || '').replace(/^\/+/, '')
  const bucketBase = String(DEV_BUCKET_URL || '').replace(/\/+$/, '')
  const isAbsolute = /^https?:\/\//i.test(videoPath)
  const videoSrc = isAbsolute
    ? videoPath
    : bucketBase
      ? `${bucketBase}/${videoPath}`
      : `/videos/${videoPath}`

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (paused) el.pause()
  }, [paused])

  return (
    <div className="qv-video-wrap">
      <video ref={videoRef} className="qv-video" src={videoSrc} controls />
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
