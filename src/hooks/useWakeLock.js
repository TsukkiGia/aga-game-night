import { useEffect, useRef } from 'react'

export function useWakeLock(enabled = true) {
  const sentinelRef = useRef(null)

  useEffect(() => {
    if (!enabled) return
    if (typeof window === 'undefined') return
    if (!('wakeLock' in navigator)) return

    let cancelled = false

    async function requestWakeLock() {
      if (cancelled) return
      if (document.visibilityState !== 'visible') return
      if (sentinelRef.current) return

      try {
        const sentinel = await navigator.wakeLock.request('screen')
        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          if (sentinelRef.current === sentinel) sentinelRef.current = null
        })
      } catch {
        // Ignore unsupported/denied requests; app continues normally.
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') requestWakeLock()
    }

    function handleUserInteraction() {
      requestWakeLock()
    }

    requestWakeLock()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pointerdown', handleUserInteraction)
    window.addEventListener('keydown', handleUserInteraction)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pointerdown', handleUserInteraction)
      window.removeEventListener('keydown', handleUserInteraction)
      const sentinel = sentinelRef.current
      sentinelRef.current = null
      sentinel?.release?.().catch?.(() => {})
    }
  }, [enabled])
}
