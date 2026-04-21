import { useState, useEffect } from 'react'
import VideoBody from './VideoBody'
import PromptMediaElement from './PromptMediaElement'
import { cleanUrl, isCountryOutlineImageUrl } from '../utils/mediaPrompt'

export default function CustomBuzzBody({ question, paused = false, allowReveal = true, autoplayTrigger = 0 }) {
  const promptType = String(question?.promptType || '').trim().toLowerCase()
  const promptText = String(question?.promptText || '').trim()
  const mediaUrl = cleanUrl(question?.mediaUrl)
  const [revealed, setRevealed] = useState(false)
  const [failedImageUrl, setFailedImageUrl] = useState('')
  const useDarkBackdrop = promptType === 'image' && isCountryOutlineImageUrl(mediaUrl)
  const imageError = Boolean(mediaUrl) && failedImageUrl === mediaUrl

  useEffect(() => {
    if (promptType === 'image' && mediaUrl) {
      console.log('[CustomBuzzBody] image prompt URL:', mediaUrl)
    }
  }, [promptType, mediaUrl])

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
        <VideoBody
          question={mappedQuestion}
          paused={paused}
          allowReveal={allowReveal}
          autoplayTrigger={autoplayTrigger}
        />
      </div>
    )
  }

  return (
    <div className="qv-custom-wrap">
      {promptText && <div className="qv-custom-prompt">{promptText}</div>}
      {promptType === 'image' && mediaUrl && (
        <div className={`qv-custom-image-shell${useDarkBackdrop ? ' dark-backdrop' : ''}`}>
          {imageError ? (
            <div className="qv-video-error">Could not load image URL. Check the link and try another image.</div>
          ) : (
            <PromptMediaElement
              mediaType="image"
              mediaUrl={mediaUrl}
              imageClassName={`qv-custom-image${useDarkBackdrop ? ' dark-backdrop' : ''}`}
              imageAlt="Custom buzz prompt"
              onImageLoad={() => console.log('[CustomBuzzBody] image loaded:', mediaUrl)}
              onImageError={() => {
                console.log('[CustomBuzzBody] image failed to load:', mediaUrl)
                setFailedImageUrl(mediaUrl)
              }}
            />
          )}
        </div>
      )}
      {allowReveal && !revealed ? (
        <button className="qv-reveal-btn" onClick={() => setRevealed(true)}>Reveal Answer ▼</button>
      ) : allowReveal ? (
        <div className="buzz-popup-answer qv-custom-answer-card">
          <div className="buzz-popup-answer-label">Answer</div>
          <div className="buzz-popup-answer-text">{question?.answer}</div>
          {question?.explanation && (
            <div className="buzz-popup-answer-explanation">{question.explanation}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
