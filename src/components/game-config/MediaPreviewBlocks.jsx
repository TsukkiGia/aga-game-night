import { useMemo, useState } from 'react'
import { cleanUrl, toYouTubeEmbedUrl } from '../../utils/mediaPrompt'
import { questionPreviewMedia } from './helpers'

export function QuestionPreviewMedia({ round, question }) {
  const media = useMemo(() => questionPreviewMedia(round, question), [round, question])
  const [failed, setFailed] = useState(false)

  if (!media) return null

  const isHttp = /^https?:\/\//i.test(media.rawUrl)
  const youtubeEmbedUrl = media.type === 'video' && isHttp ? toYouTubeEmbedUrl(media.rawUrl) : null
  const videoSrc = isHttp ? media.rawUrl : `/videos/${media.rawUrl.replace(/^\/+/, '')}`

  return (
    <div className="game-config-preview-media-wrap">
      {failed ? (
        <div className="game-config-preview-media-fallback">Could not load preview media.</div>
      ) : media.type === 'image' ? (
        <img
          className="game-config-preview-media-image"
          src={media.rawUrl}
          alt="Question media preview"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : youtubeEmbedUrl ? (
        <iframe
          className="game-config-preview-media-video"
          src={youtubeEmbedUrl}
          title="Question media preview"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onError={() => setFailed(true)}
        />
      ) : (
        <video
          className="game-config-preview-media-video"
          src={videoSrc}
          controls
          preload="metadata"
          muted
          playsInline
          onError={() => setFailed(true)}
        />
      )}
    </div>
  )
}

export function MediaPreview({ promptType, mediaUrl }) {
  const url = cleanUrl(mediaUrl)
  const [status, setStatus] = useState('idle')
  const youtubeEmbed = useMemo(() => (
    promptType === 'video' ? toYouTubeEmbedUrl(url) : null
  ), [promptType, url])

  if (!url || (promptType !== 'image' && promptType !== 'video')) return null

  return (
    <div className="game-config-media-preview">
      <div className={`game-config-media-preview-badge status-${status}`}>
        {status === 'ok' ? 'Preview loaded' : status === 'error' ? 'Could not load preview' : 'Loading preview...'}
      </div>
      {promptType === 'image' ? (
        <img
          className="game-config-media-preview-image"
          src={url}
          alt="Prompt preview"
          referrerPolicy="no-referrer"
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      ) : youtubeEmbed ? (
        <iframe
          className="game-config-media-preview-frame"
          src={youtubeEmbed}
          title="Video preview"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          onLoad={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      ) : (
        <video
          className="game-config-media-preview-video"
          src={url}
          controls
          preload="metadata"
          onLoadedData={() => setStatus('ok')}
          onError={() => setStatus('error')}
        />
      )}
    </div>
  )
}
