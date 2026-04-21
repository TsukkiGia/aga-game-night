import { cleanUrl, resolveVideoSource } from '../utils/mediaPrompt'

export default function PromptMediaElement({
  mediaType,
  mediaUrl,
  localVideoBasePath = '',
  imageClassName = '',
  videoClassName = '',
  iframeClassName = '',
  imageAlt = 'Media prompt',
  iframeTitle = 'Video prompt',
  imageReferrerPolicy = 'no-referrer',
  iframeReferrerPolicy = 'strict-origin-when-cross-origin',
  loading = undefined,
  controls = true,
  autoPlay = false,
  muted = false,
  playsInline = false,
  videoPreload = 'metadata',
  youtubeAutoplay = false,
  imageRef = null,
  videoRef = null,
  iframeRef = null,
  onImageLoad = undefined,
  onImageError = undefined,
  onVideoLoadedData = undefined,
  onVideoError = undefined,
  onIframeLoad = undefined,
  onIframeError = undefined,
}) {
  const normalizedType = String(mediaType || '').trim().toLowerCase()
  const url = cleanUrl(mediaUrl)
  if (!url) return null

  if (normalizedType === 'image') {
    return (
      <img
        ref={imageRef}
        className={imageClassName}
        src={url}
        alt={imageAlt}
        referrerPolicy={imageReferrerPolicy}
        loading={loading}
        onLoad={onImageLoad}
        onError={onImageError}
      />
    )
  }

  if (normalizedType !== 'video') return null
  const videoSource = resolveVideoSource(url, { localVideoBasePath, autoplay: youtubeAutoplay })
  if (!videoSource) return null

  if (videoSource.kind === 'youtube') {
    return (
      <iframe
        ref={iframeRef}
        className={iframeClassName}
        src={videoSource.src}
        title={iframeTitle}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy={iframeReferrerPolicy}
        loading={loading}
        allowFullScreen
        onLoad={onIframeLoad}
        onError={onIframeError}
      />
    )
  }

  return (
    <video
      ref={videoRef}
      className={videoClassName}
      src={videoSource.src}
      controls={controls}
      autoPlay={autoPlay}
      muted={muted}
      playsInline={playsInline}
      preload={videoPreload}
      onLoadedData={onVideoLoadedData}
      onError={onVideoError}
    />
  )
}
