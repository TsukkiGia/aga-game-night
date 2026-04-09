import { useState, useEffect, useRef } from 'react'
import { playTransition } from '../sounds'

function parseTimeToSeconds(raw) {
  if (!raw) return null
  const input = String(raw).trim().toLowerCase()
  if (!input) return null
  if (/^\d+$/.test(input)) return Number.parseInt(input, 10)
  const match = input.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match) return null
  const hours = Number.parseInt(match[1] || '0', 10)
  const mins = Number.parseInt(match[2] || '0', 10)
  const secs = Number.parseInt(match[3] || '0', 10)
  return (hours * 3600) + (mins * 60) + secs
}

function getYouTubeIdAndParams(rawUrl) {
  try {
    const url = new URL(rawUrl)
    const host = url.hostname.replace(/^www\./, '')
    const path = url.pathname

    let id = null
    if (host === 'youtu.be') {
      id = path.split('/').filter(Boolean)[0] || null
    } else if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'music.youtube.com' ||
      host === 'youtube-nocookie.com'
    ) {
      if (path === '/watch') id = url.searchParams.get('v')
      else if (path.startsWith('/embed/')) id = path.split('/')[2] || null
      else if (path.startsWith('/shorts/')) id = path.split('/')[2] || null
      else if (path.startsWith('/live/')) id = path.split('/')[2] || null
    }
    if (!id) return null

    const start = parseTimeToSeconds(url.searchParams.get('start') || url.searchParams.get('t'))
    const end = parseTimeToSeconds(url.searchParams.get('end'))
    return { id, start, end }
  } catch {
    return null
  }
}

function toYouTubeEmbedUrl(rawUrl) {
  const parsed = getYouTubeIdAndParams(rawUrl)
  if (!parsed) return null
  const params = new URLSearchParams({
    controls: '1',
    disablekb: '1',
    iv_load_policy: '3',
    rel: '0',
    modestbranding: '1',
    playsinline: '1',
    enablejsapi: '1',
    origin: window.location.origin,
  })
  if (Number.isInteger(parsed.start) && parsed.start > 0) params.set('start', String(parsed.start))
  if (Number.isInteger(parsed.end) && parsed.end > 0) params.set('end', String(parsed.end))
  return `https://www.youtube-nocookie.com/embed/${parsed.id}?${params.toString()}`
}

export default function VideoBody({ question, paused }) {
  const videoRef = useRef(null)
  const iframeRef = useRef(null)
  const [revealed, setRevealed] = useState(false)
  const [loadError, setLoadError] = useState('')
  const videoPath = String(question.video || '').trim().replace(/^\/+/, '')
  const youtubeEmbedUrl = toYouTubeEmbedUrl(videoPath)
  const isYouTube = Boolean(youtubeEmbedUrl)
  const isAbsolute = /^https?:\/\//i.test(videoPath)
  const videoSrc = isAbsolute
    ? videoPath
    : `/videos/${videoPath}`

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

  return (
    <div className="qv-video-wrap">
      {loadError && (
        <div className="qv-video-error">
          {loadError}
        </div>
      )}
      {isYouTube ? (
        <div className="qv-video-yt-mask">
          <iframe
            ref={iframeRef}
            className="qv-video-yt-frame"
            src={youtubeEmbedUrl}
            title={question?.id || 'YouTube video'}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            onError={() => setLoadError('Could not load this YouTube video. Check the URL or choose another clip.')}
          />
        </div>
      ) : (
        <video
          ref={videoRef}
          className="qv-video"
          src={videoSrc}
          controls
          onError={() => setLoadError(`Could not load local video "${videoPath}". Add it to /public/videos or switch to a YouTube link.`)}
        />
      )}
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
