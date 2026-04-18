function cleanUrl(rawUrl) {
  return String(rawUrl || '').trim()
}

function isHttpUrl(rawUrl) {
  const urlText = cleanUrl(rawUrl)
  if (!urlText) return false
  try {
    const parsed = new URL(urlText)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isKnownWebPageUrl(rawUrl) {
  try {
    const parsed = new URL(cleanUrl(rawUrl))
    const host = parsed.hostname.replace(/^www\./i, '').toLowerCase()
    const path = parsed.pathname.toLowerCase()
    if (host.endsWith('wikipedia.org') && path.startsWith('/wiki/')) return true
    if (/\.(html?|php|aspx?)$/i.test(path)) return true
    return false
  } catch {
    return false
  }
}

function looksLikeDirectImageUrl(rawUrl) {
  try {
    const parsed = new URL(cleanUrl(rawUrl))
    const path = parsed.pathname.toLowerCase()
    return /\.(png|jpe?g|gif|webp|avif|svg|bmp|ico|tiff?)$/i.test(path)
  } catch {
    return false
  }
}

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

function toYouTubeEmbedUrl(rawUrl) {
  try {
    const url = new URL(cleanUrl(rawUrl))
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
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

    const params = new URLSearchParams({
      controls: '1',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
    })
    const start = parseTimeToSeconds(url.searchParams.get('start') || url.searchParams.get('t'))
    if (Number.isInteger(start) && start > 0) params.set('start', String(start))
    const end = parseTimeToSeconds(url.searchParams.get('end'))
    if (Number.isInteger(end) && end > 0) params.set('end', String(end))
    return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`
  } catch {
    return null
  }
}

function mediaUrlFeedback(question) {
  const promptType = String(question?.promptType || '').trim().toLowerCase()
  const mediaUrl = cleanUrl(question?.mediaUrl)
  if (promptType !== 'image' && promptType !== 'video') return null
  if (!mediaUrl) return { kind: 'error', message: 'Media URL is required.' }
  if (!isHttpUrl(mediaUrl)) return { kind: 'error', message: 'Media URL must start with http:// or https://.' }
  if (promptType === 'image') {
    if (isKnownWebPageUrl(mediaUrl)) {
      return { kind: 'error', message: 'This looks like a web page, not a direct image. Use a file URL from an image host.' }
    }
    if (!looksLikeDirectImageUrl(mediaUrl)) {
      return { kind: 'warn', message: 'This may not be a direct image file URL. Verify in preview below.' }
    }
  }
  return { kind: 'ok', message: 'URL format looks valid.' }
}

export {
  cleanUrl,
  isHttpUrl,
  isKnownWebPageUrl,
  looksLikeDirectImageUrl,
  parseTimeToSeconds,
  toYouTubeEmbedUrl,
  mediaUrlFeedback,
}
