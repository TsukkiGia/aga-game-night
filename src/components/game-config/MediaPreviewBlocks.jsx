import { useMemo, useState } from 'react'
import PromptMediaElement from '../question-bodies/PromptMediaElement'
import { cleanUrl, isCountryOutlineImageUrl } from '../../utils/mediaPrompt'

export function MediaPreview({ promptType, mediaUrl }) {
  const url = cleanUrl(mediaUrl)
  const [status, setStatus] = useState('idle')
  const useDarkBackdrop = promptType === 'image' && isCountryOutlineImageUrl(url)
  const mediaType = useMemo(() => (promptType === 'image' ? 'image' : 'video'), [promptType])

  if (!url || (promptType !== 'image' && promptType !== 'video')) return null

  return (
    <div className={`game-config-media-preview${useDarkBackdrop ? ' dark-backdrop' : ''}`}>
      <div className={`game-config-media-preview-badge status-${status}`}>
        {status === 'ok' ? 'Preview loaded' : status === 'error' ? 'Could not load preview' : 'Loading preview...'}
      </div>
      <PromptMediaElement
        mediaType={mediaType}
        mediaUrl={url}
        imageClassName={`game-config-media-preview-image${useDarkBackdrop ? ' dark-backdrop' : ''}`}
        iframeClassName="game-config-media-preview-frame"
        videoClassName="game-config-media-preview-video"
        imageAlt="Prompt preview"
        iframeTitle="Video preview"
        controls
        videoPreload="metadata"
        onImageLoad={() => setStatus('ok')}
        onImageError={() => setStatus('error')}
        onIframeLoad={() => setStatus('ok')}
        onIframeError={() => setStatus('error')}
        onVideoLoadedData={() => setStatus('ok')}
        onVideoError={() => setStatus('error')}
      />
    </div>
  )
}
