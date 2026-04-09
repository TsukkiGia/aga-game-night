import { useState, useEffect, useCallback, useRef } from 'react'
import { socket } from '../socket'
import { playBuzzIn, playArm, playSoundBiteByKey, unlockAudio } from '../sounds'
import { mapHostAuthError } from '../auth'
import { clearHostCredentials, readHostCredentials, writeHostCredentials } from '../storage'

export function useGameSocket(initialTeams, options = {}) {
  const onBuzzWinner = typeof options.onBuzzWinner === 'function' ? options.onBuzzWinner : null
  const onBuzzAttempt = typeof options.onBuzzAttempt === 'function' ? options.onBuzzAttempt : null
  const onStateSync = typeof options.onStateSync === 'function' ? options.onStateSync : null
  const onBuzzWinnerRef = useRef(onBuzzWinner)
  const onBuzzAttemptRef = useRef(onBuzzAttempt)
  const onStateSyncRef = useRef(onStateSync)

  useEffect(() => {
    onBuzzWinnerRef.current = onBuzzWinner
    onBuzzAttemptRef.current = onBuzzAttempt
    onStateSyncRef.current = onStateSync
  }, [onBuzzWinner, onBuzzAttempt, onStateSync])
  const [armed, setArmed] = useState(false)
  const [buzzWinner, setBuzzWinner] = useState(null)
  const [members, setMembers] = useState([])
  const [stealMode, setStealMode] = useState(false)
  const [hostReady, setHostReady] = useState(false)
  const [timerControlSignal, setTimerControlSignal] = useState({ sequence: 0, action: null })
  const [sessionCode, setSessionCode] = useState(() => readHostCredentials()?.sessionCode || '')
  const [authState, setAuthState] = useState(() => {
    const saved = readHostCredentials()
    return {
      required: !saved,
      error: saved ? '' : 'Enter session code and host PIN.',
      sessionCode: saved?.sessionCode || '',
      authenticating: false,
    }
  })

  const submitAuth = useCallback((sessionCodeInput, pinInput, options = {}) => {
    const showAuthUi = options?.showAuthUi !== false
    const normalizedSessionCode = String(sessionCodeInput || '').trim().toUpperCase()
    const normalizedPin = String(pinInput || '').trim()
    if (!normalizedSessionCode || !normalizedPin) {
      setHostReady(false)
      setSessionCode('')
      setAuthState({
        required: true,
        error: 'Session code and host PIN are required.',
        sessionCode: normalizedSessionCode,
        authenticating: false,
      })
      return Promise.resolve({ ok: false, error: 'missing-credentials' })
    }

    setAuthState((prev) => ({
      required: showAuthUi ? true : prev.required,
      error: '',
      sessionCode: normalizedSessionCode,
      authenticating: true,
    }))

    return new Promise((resolve) => {
      socket.emit('host:auth', { sessionCode: normalizedSessionCode, pin: normalizedPin, role: 'controller' }, (authResult) => {
        if (!authResult?.ok) {
          setHostReady(false)
          setSessionCode('')
          clearHostCredentials()
          setAuthState({
            required: true,
            error: mapHostAuthError(authResult?.error),
            sessionCode: normalizedSessionCode,
            authenticating: false,
          })
          resolve({ ok: false, error: authResult?.error || 'unauthorized' })
          return
        }

        writeHostCredentials(normalizedSessionCode, normalizedPin)
        setSessionCode(normalizedSessionCode)
        socket.emit('host:setup', initialTeams, (setupResult) => {
          if (!setupResult?.ok) {
            setHostReady(false)
            setAuthState({
              required: true,
              error: 'Could not initialize host session. Try again.',
              sessionCode: normalizedSessionCode,
              authenticating: false,
            })
            resolve({ ok: false, error: 'setup-failed' })
            return
          }

          setHostReady(true)
          setAuthState({
            required: false,
            error: '',
            sessionCode: normalizedSessionCode,
            authenticating: false,
          })
          resolve({ ok: true })
        })
      })
    })
  }, [initialTeams])

  useEffect(() => {
    function authenticateAndSetup() {
      const creds = readHostCredentials()
      if (!creds) {
        setHostReady(false)
        setSessionCode('')
        setAuthState({
          required: true,
          error: 'Enter session code and host PIN.',
          sessionCode: '',
          authenticating: false,
        })
        return
      }
      void submitAuth(creds.sessionCode, creds.pin, { showAuthUi: false })
    }

    function syncState(state) {
      setArmed(Boolean(state.armed))
      setBuzzWinner(
        state.buzzedBy === null
          ? null
          : {
              teamIndex: state.buzzedBy,
              team: state.teams[state.buzzedBy],
              memberName: state.buzzedMemberName,
            }
      )
      onStateSyncRef.current?.(state)
    }

    function onDisconnect() {
      setHostReady(false)
      setAuthState((prev) => ({ ...prev, authenticating: false }))
    }

    function onRemoteSound(payload) {
      const packet = (payload && typeof payload === 'object')
        ? payload
        : { soundKey: payload, requestId: '', sourceSocketId: '' }
      const soundKey = String(packet.soundKey || '').trim()
      Promise.resolve(playSoundBiteByKey(soundKey))
        .then((ok) => {
          const requestId = String(packet.requestId || '').trim()
          const sourceSocketId = String(packet.sourceSocketId || '').trim()
          if (requestId && sourceSocketId) {
            socket.emit('host:sfx:result', {
              requestId,
              sourceSocketId,
              ok,
              error: ok ? null : 'audio-blocked',
            })
          }
          if (!ok) console.warn('[host:sfx:play] blocked by browser audio policy')
        })
        .catch(() => {
          const requestId = String(packet.requestId || '').trim()
          const sourceSocketId = String(packet.sourceSocketId || '').trim()
          if (requestId && sourceSocketId) {
            socket.emit('host:sfx:result', {
              requestId,
              sourceSocketId,
              ok: false,
              error: 'playback-failed',
            })
          }
        })
    }

    function primeAudio() {
      unlockAudio()
    }

    function onTimerStop() {
      setTimerControlSignal((prev) => ({ sequence: prev.sequence + 1, action: 'stop' }))
    }

    function onTimerRestart() {
      setTimerControlSignal((prev) => ({ sequence: prev.sequence + 1, action: 'restart' }))
    }

    socket.on('connect', authenticateAndSetup)
    socket.on('disconnect', onDisconnect)
    if (socket.connected) authenticateAndSetup()
    socket.connect()

    socket.on('state:sync',   syncState)
    socket.on('buzz:armed',   () => setArmed(true))
    socket.on('buzz:reset',   () => { setArmed(false); setBuzzWinner(null) })
    socket.on('buzz:winner',  (data) => {
      if (!data || typeof data.teamIndex !== 'number' || !data.team?.name || !data.team?.color) return
      setArmed(false)
      setBuzzWinner(data)
      playBuzzIn()
      onBuzzWinnerRef.current?.(data)
    })
    socket.on('buzz:attempt', (data) => {
      if (!data || typeof data.teamIndex !== 'number' || !data.team?.name || !data.team?.color) return
      if (!Number.isFinite(data.reactionMs)) return
      onBuzzAttemptRef.current?.(data)
    })
    socket.on('host:members', (data) => setMembers(data))
    socket.on('host:sfx:play', onRemoteSound)
    socket.on('host:timer:stop', onTimerStop)
    socket.on('host:timer:restart', onTimerRestart)
    window.addEventListener('pointerdown', primeAudio)
    window.addEventListener('keydown', primeAudio)

    return () => {
      socket.off('connect', authenticateAndSetup)
      socket.off('disconnect', onDisconnect)
      socket.off('state:sync', syncState)
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.off('buzz:attempt')
      socket.off('host:members')
      socket.off('host:sfx:play', onRemoteSound)
      socket.off('host:timer:stop', onTimerStop)
      socket.off('host:timer:restart', onTimerRestart)
      window.removeEventListener('pointerdown', primeAudio)
      window.removeEventListener('keydown', primeAudio)
    }
  }, [submitAuth])

  function handleArm(options = {}) {
    const safeOptions = {}
    if (options && typeof options === 'object' && !Array.isArray(options)) {
      if (Array.isArray(options.allowedTeamIndices)) safeOptions.allowedTeamIndices = options.allowedTeamIndices
    }
    socket.emit('host:arm', safeOptions, (result) => {
      if (result?.ok) playArm()
    })
  }

  function handleManualBuzz(teamIndex, teams) {
    setBuzzWinner({ team: teams[teamIndex], teamIndex, memberName: null, manual: true })
    setStealMode(false)
  }

  function handleDismiss() {
    socket.emit('host:reset', (result) => {
      if (result?.ok) setStealMode(false)
    })
  }

  function handleWrongAndSteal(config = null) {
    let allowedTeamIndices = null
    if (Array.isArray(config)) {
      allowedTeamIndices = config
    } else if (config && typeof config === 'object' && !Array.isArray(config)) {
      if (Array.isArray(config.allowedTeamIndices)) allowedTeamIndices = config.allowedTeamIndices
    }

    socket.emit('host:reset', (resetResult) => {
      if (!resetResult?.ok) return
      setStealMode(true)
      const armOptions = {}
      if (allowedTeamIndices) armOptions.allowedTeamIndices = allowedTeamIndices
      socket.emit('host:arm', armOptions, (armResult) => {
        if (armResult?.ok) playArm()
        else setStealMode(false)
      })
    })
  }

  function handleRearm(options = {}) {
    setBuzzWinner(null)
    setStealMode(false)
    socket.emit('host:reset', (resetResult) => {
      if (!resetResult?.ok) return
      socket.emit('host:arm', options, (armResult) => {
        if (armResult?.ok) playArm()
      })
    })
  }

  const syncHostQuestion = useCallback((activeQuestion) => {
    if (!hostReady) return
    socket.emit('host:question:set', activeQuestion)
  }, [hostReady])

  const invalidateAuth = useCallback((message = 'Host authorization expired. Sign in again.') => {
    setHostReady(false)
    setAuthState((prev) => ({
      required: true,
      error: message,
      sessionCode: prev.sessionCode || sessionCode || '',
      authenticating: false,
    }))
  }, [sessionCode])

  return {
    armed,
    buzzWinner,
    members,
    stealMode,
    hostReady,
    sessionCode,
    authState,
    submitAuth,
    handleArm,
    handleDismiss,
    handleWrongAndSteal,
    handleManualBuzz,
    handleRearm,
    syncHostQuestion,
    timerControlSignal,
    invalidateAuth,
  }
}
