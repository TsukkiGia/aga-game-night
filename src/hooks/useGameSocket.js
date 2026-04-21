import { useState, useEffect, useCallback, useRef } from 'react'
import { socket } from '../socket'
import { playBuzzIn, playArm, playSoundBiteByKey, unlockAudio } from '../sounds'
import { mapHostAuthError } from '../auth'
import { clearHostCredentials, readHostCredentials, writeHostCredentials } from '../storage'
import { normalizeGameplayMode } from '../gameplayMode'

export function useGameSocket(initialTeams, options = {}) {
  const onBuzzWinner = typeof options.onBuzzWinner === 'function' ? options.onBuzzWinner : null
  const onBuzzAttempt = typeof options.onBuzzAttempt === 'function' ? options.onBuzzAttempt : null
  const onStateSync = typeof options.onStateSync === 'function' ? options.onStateSync : null
  const onAnswerAttempt = typeof options.onAnswerAttempt === 'function' ? options.onAnswerAttempt : null
  const onAnswerCorrect = typeof options.onAnswerCorrect === 'function' ? options.onAnswerCorrect : null
  const onAnswerTimeout = typeof options.onAnswerTimeout === 'function' ? options.onAnswerTimeout : null
  const onAnswerState = typeof options.onAnswerState === 'function' ? options.onAnswerState : null
  const setupPayload = (options.setupPayload && typeof options.setupPayload === 'object' && !Array.isArray(options.setupPayload))
    ? options.setupPayload
    : null
  const setupPayloadRef = useRef(setupPayload)
  const onBuzzWinnerRef = useRef(onBuzzWinner)
  const onBuzzAttemptRef = useRef(onBuzzAttempt)
  const onStateSyncRef = useRef(onStateSync)
  const onAnswerAttemptRef = useRef(onAnswerAttempt)
  const onAnswerCorrectRef = useRef(onAnswerCorrect)
  const onAnswerTimeoutRef = useRef(onAnswerTimeout)
  const onAnswerStateRef = useRef(onAnswerState)

  useEffect(() => {
    onBuzzWinnerRef.current = onBuzzWinner
    onBuzzAttemptRef.current = onBuzzAttempt
    onStateSyncRef.current = onStateSync
    onAnswerAttemptRef.current = onAnswerAttempt
    onAnswerCorrectRef.current = onAnswerCorrect
    onAnswerTimeoutRef.current = onAnswerTimeout
    onAnswerStateRef.current = onAnswerState
    setupPayloadRef.current = setupPayload
  }, [onBuzzWinner, onBuzzAttempt, onStateSync, setupPayload, onAnswerAttempt, onAnswerCorrect, onAnswerTimeout, onAnswerState])
  const [armed, setArmed] = useState(false)
  const [buzzWinner, setBuzzWinner] = useState(null)
  const [gameplayMode, setGameplayMode] = useState(() => normalizeGameplayMode(setupPayload?.gameplayMode))
  const [answerState, setAnswerState] = useState(null)
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
        const payload = setupPayloadRef.current
        socket.emit('host:setup', {
          teams: initialTeams,
          ...(Array.isArray(payload?.gamePlan) ? { gamePlan: payload.gamePlan } : {}),
          ...(Array.isArray(payload?.roundCatalog) ? { roundCatalog: payload.roundCatalog } : {}),
          ...(payload?.gameplayMode ? { gameplayMode: payload.gameplayMode } : {}),
        }, (setupResult) => {
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
      setGameplayMode(normalizeGameplayMode(state?.gameplayMode, setupPayloadRef.current?.gameplayMode))
      setAnswerState(state?.answerState || null)
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
      if (state?.answerState) onAnswerStateRef.current?.(state.answerState)
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

    function onBuzzArmed() {
      setArmed(true)
    }

    function onBuzzReset() {
      setArmed(false)
      setBuzzWinner(null)
    }

    function onBuzzWinnerEvent(data) {
      if (!data || typeof data.teamIndex !== 'number' || !data.team?.name || !data.team?.color) return
      setArmed(false)
      setBuzzWinner(data)
      playBuzzIn()
      onBuzzWinnerRef.current?.(data)
    }

    function onBuzzAttemptEvent(data) {
      if (!data || typeof data.teamIndex !== 'number' || !data.team?.name || !data.team?.color) return
      if (!Number.isFinite(data.reactionMs)) return
      onBuzzAttemptRef.current?.(data)
    }

    function onHostMembers(data) {
      setMembers(data)
    }

    function onAnswerAttemptEvent(payload) {
      if (!payload || typeof payload !== 'object') return
      onAnswerAttemptRef.current?.(payload)
    }

    function onAnswerCorrectEvent(payload) {
      if (!payload || typeof payload !== 'object') return
      onAnswerCorrectRef.current?.(payload)
    }

    function onAnswerTimeoutEvent(payload) {
      if (!payload || typeof payload !== 'object') return
      onAnswerTimeoutRef.current?.(payload)
    }

    function onAnswerStateEvent(payload) {
      if (!payload || typeof payload !== 'object') return
      setAnswerState(payload)
      onAnswerStateRef.current?.(payload)
    }

    socket.on('connect', authenticateAndSetup)
    socket.on('disconnect', onDisconnect)
    if (socket.connected) authenticateAndSetup()
    socket.connect()

    socket.on('state:sync',   syncState)
    socket.on('buzz:armed', onBuzzArmed)
    socket.on('buzz:reset', onBuzzReset)
    socket.on('buzz:winner', onBuzzWinnerEvent)
    socket.on('buzz:attempt', onBuzzAttemptEvent)
    socket.on('answer:attempt', onAnswerAttemptEvent)
    socket.on('answer:correct', onAnswerCorrectEvent)
    socket.on('answer:timeout', onAnswerTimeoutEvent)
    socket.on('answer:state', onAnswerStateEvent)
    socket.on('host:members', onHostMembers)
    socket.on('host:sfx:play', onRemoteSound)
    socket.on('host:timer:stop', onTimerStop)
    socket.on('host:timer:restart', onTimerRestart)
    window.addEventListener('pointerdown', primeAudio)
    window.addEventListener('keydown', primeAudio)

    return () => {
      socket.off('connect', authenticateAndSetup)
      socket.off('disconnect', onDisconnect)
      socket.off('state:sync', syncState)
      socket.off('buzz:armed', onBuzzArmed)
      socket.off('buzz:reset', onBuzzReset)
      socket.off('buzz:winner', onBuzzWinnerEvent)
      socket.off('buzz:attempt', onBuzzAttemptEvent)
      socket.off('answer:attempt', onAnswerAttemptEvent)
      socket.off('answer:correct', onAnswerCorrectEvent)
      socket.off('answer:timeout', onAnswerTimeoutEvent)
      socket.off('answer:state', onAnswerStateEvent)
      socket.off('host:members', onHostMembers)
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
    gameplayMode,
    answerState,
    members,
    stealMode,
    hostReady,
    sessionCode,
    authState,
    submitAuth,
    handleArm,
    handleDismiss,
    handleWrongAndSteal,
    handleRearm,
    syncHostQuestion,
    timerControlSignal,
    invalidateAuth,
  }
}
