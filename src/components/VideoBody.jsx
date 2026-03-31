import { useEffect, useRef } from 'react'

export default function VideoBody({ question, paused }) {
  const videoRef = useRef(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    if (paused) el.pause()
  }, [paused])

  return (
    <div className="qv-video-wrap">
      <video ref={videoRef} className="qv-video" src={`/videos/${question.video}`} controls />
    </div>
  )
}
