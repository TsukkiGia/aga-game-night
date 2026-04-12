import { useState } from 'react'
import VideoBody from './VideoBody'

export default function CustomBuzzBody({ question, paused = false }) {
  const promptType = String(question?.promptType || '').trim().toLowerCase()
  const promptText = String(question?.promptText || '').trim()
  const mediaUrl = String(question?.mediaUrl || '').trim()
  const [revealed, setRevealed] = useState(false)
  const [imageError, setImageError] = useState(false)

  if (promptType === 'video') {
    const mappedQuestion = {
      id: question?.id || 'custom-video',
      video: mediaUrl,
      answer: question?.answer,
      explanation: question?.explanation,
    }
    return (
      <div className="qv-custom-wrap">
        {promptText && <div className="qv-custom-prompt">{promptText}</div>}
        <VideoBody question={mappedQuestion} paused={paused} />
      </div>
    )
  }

  return (
    <div className="qv-custom-wrap">
      {promptText && <div className="qv-custom-prompt">{promptText}</div>}
      {promptType === 'image' && mediaUrl && (
        <div className="qv-custom-image-shell">
          {imageError ? (
            <div className="qv-video-error">Could not load image URL. Check the link and try another image.</div>
          ) : (
            <img
              className="qv-custom-image"
              src={mediaUrl}
              alt="Custom buzz prompt"
              onError={() => setImageError(true)}
            />
          )}
        </div>
      )}
      {!revealed ? (
        <button className="qv-reveal-btn" onClick={() => setRevealed(true)}>Reveal Answer ▼</button>
      ) : (
        <div className="buzz-popup-answer qv-custom-answer-card">
          <div className="buzz-popup-answer-label">Answer</div>
          <div className="buzz-popup-answer-text">{question?.answer}</div>
          {question?.explanation && (
            <div className="buzz-popup-answer-explanation">{question.explanation}</div>
          )}
        </div>
      )}
    </div>
  )
}
