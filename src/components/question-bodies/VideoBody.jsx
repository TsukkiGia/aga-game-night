import { useState, useEffect, useRef, useCallback } from 'react'
import { playTransition } from '../../core/sounds'
import PromptMediaElement from './PromptMediaElement'
import { cleanUrl, resolveVideoSource } from '../../utils/mediaPrompt'

export default function VideoBody({ question, paused, allowReveal = true, autoplayTrigger = 0 }) {
  const videoRef = useRef(null)
  const iframeRef = useRef(null)
  const lastAutoplayTriggerRef = useRef(0)
  const [revealed, setRevealed] = useState(false)
  const [loadError, setLoadError] = useState('')
  const videoPath = cleanUrl(question.video)
  const videoSource = resolveVideoSource(videoPath, { localVideoBasePath: '/videos' })
  const isYouTube = videoSource?.kind === 'youtube'
  const shouldAutoplay = (Number(autoplayTrigger) || 0) > 0

  const requestAutoplay = useCallback(() => {
    if (!shouldAutoplay) return
    if (paused) return
    if (isYouTube) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
        '*'
      )
      return
    }
    const el = videoRef.current
    if (!el) return
    el.play().catch(() => {})
  }, [paused, isYouTube, shouldAutoplay])

  useEffect(() => {
    if (!paused) return
    if (isYouTube) {
      iframeRef.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
        '*'
      )
      return
    }
    const el = videoRef.current
    if (!el) return
    el.pause()
  }, [paused, isYouTube])

  useEffect(() => {
    const trigger = Number(autoplayTrigger) || 0
    if (trigger <= 0) return
    if (trigger === lastAutoplayTriggerRef.current) return
    lastAutoplayTriggerRef.current = trigger
    requestAutoplay()
  }, [autoplayTrigger, requestAutoplay])

  function handleVideoError() {
    if (!videoSource) {
      setLoadError('Missing video URL for this question.')
      return
    }
    if (videoSource.kind === 'youtube') {
      setLoadError('Could not load this YouTube video. Check the URL or choose another clip.')
      return
    }
    if (!videoSource.isAbsolute) {
      setLoadError(`Could not load local video "${videoSource.raw}". Add it to /public/videos or switch to a YouTube link.`)
      return
    }
    setLoadError('Could not load this video URL. Check the URL or choose another clip.')
  }

  return (
    <div className="qv-video-wrap">
      {loadError && (
        <div className="qv-video-error">
          {loadError}
        </div>
      )}
      {!videoSource ? (
        <div className="qv-video-error">Missing video URL for this question.</div>
      ) : isYouTube ? (
        <div className="qv-video-yt-mask">
          <PromptMediaElement
            mediaType="video"
            mediaUrl={videoPath}
            localVideoBasePath="/videos"
            iframeRef={iframeRef}
          iframeClassName="qv-video-yt-frame"
          iframeTitle={question?.id || 'YouTube video'}
          youtubeAutoplay={shouldAutoplay}
          onIframeLoad={requestAutoplay}
          onIframeError={handleVideoError}
        />
        </div>
      ) : (
        <PromptMediaElement
          mediaType="video"
          mediaUrl={videoPath}
          localVideoBasePath="/videos"
          videoRef={videoRef}
          videoClassName="qv-video"
          controls
          autoPlay={shouldAutoplay}
          playsInline
          onVideoLoadedData={requestAutoplay}
          onVideoError={handleVideoError}
        />
      )}
      {allowReveal && !revealed ? (
        <button className="qv-reveal-btn" onClick={() => { playTransition(); setRevealed(true) }}>Reveal Answer ▼</button>
      ) : allowReveal ? (
        <div className="buzz-popup-answer">
          <div className="buzz-popup-answer-label">Answer</div>
          <div className="buzz-popup-answer-text">{question.answer}</div>
          {question.explanation && (
            <div className="buzz-popup-answer-explanation">{question.explanation}</div>
          )}
        </div>
      ) : null}
    </div>
  )
}
