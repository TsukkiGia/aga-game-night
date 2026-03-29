import { useState, useEffect, useRef } from 'react'
import { socket } from '../socket'

// status: 'join' | 'waiting' | 'armed' | 'i-buzzed' | 'locked-out'

export default function BuzzerPage() {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [team, setTeam] = useState(null)       // { name, color, code }
  const [status, setStatus] = useState('join')
  const [connected, setConnected] = useState(true)
  const inputRef = useRef(null)
  const teamRef = useRef(null)
  teamRef.current = team  // always current — no stale closure risk

  // Effect 1: socket lifecycle — runs once, never disconnects mid-session
  useEffect(() => {
    socket.connect()

    socket.on('connect',    () => setConnected(true))
    socket.on('disconnect', () => setConnected(false))
    socket.on('game:reset', () => { setTeam(null); setCode(''); setStatus('join') })
    socket.on('buzz:armed', () => setStatus('armed'))
    socket.on('buzz:reset', () => setStatus(s => s === 'join' ? s : 'waiting'))
    socket.on('buzz:winner', (data) => {
      setStatus(prev => {
        if (prev === 'armed' || prev === 'waiting') {
          return data.team.code === teamRef.current?.code ? 'i-buzzed' : 'locked-out'
        }
        return prev
      })
    })

    return () => {
      socket.off('connect')
      socket.off('disconnect')
      socket.off('game:reset')
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.disconnect()
    }
  }, [])

  // Effect 2: rejoin on reconnect — only registered once team is known
  useEffect(() => {
    if (!team) return
    function rejoin() { socket.emit('member:join', team.code, name, () => {}) }
    socket.on('connect', rejoin)
    return () => socket.off('connect', rejoin)
  }, [team, name])

  function handleJoin(e) {
    e.preventDefault()
    setError('')
    socket.emit('member:join', code, name, (res) => {
      if (res.error) {
        setError(res.error)
        return
      }
      setTeam(res.team)
      setStatus('waiting')
    })
  }

  function handleBuzz() {
    if (status !== 'armed') return
    socket.emit('member:buzz')
    // Optimistically mark as buzzed; server will confirm via buzz:winner
    setStatus('i-buzzed')
  }

  // ── Join screen ─────────────────────────────────────────────
  if (status === 'join') {
    return (
      <div className="buzzer-page">
        <div className="buzzer-join-card">
          <div className="buzzer-logo">🥁</div>
          <h1 className="buzzer-title">JOIN GAME</h1>
          <p className="buzzer-sub">Enter the code your host gave you</p>
          <form className="buzzer-form" onSubmit={handleJoin}>
            <input
              ref={inputRef}
              className="buzzer-code-input"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="XXXX"
              maxLength={4}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
            />
            <input
              className="buzzer-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              autoComplete="off"
            />
            {error && <p className="buzzer-error">{error}</p>}
            <button className="buzzer-join-btn" type="submit" disabled={code.length < 4 || !name.trim()}>
              Join Team →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Buzzer screen ────────────────────────────────────────────
  const statusConfig = {
    waiting:   { label: 'Waiting for host…',     sub: 'Hold tight — the host will arm the buzzers', pulse: false },
    armed:     { label: 'BUZZ NOW!',              sub: 'Be the first to buzz in!',                   pulse: true  },
    'i-buzzed':{ label: 'YOU BUZZED IN!',         sub: 'The host will call on you',                  pulse: false },
    'locked-out': { label: 'Locked Out',          sub: 'Another team buzzed first',                  pulse: false },
  }
  const cfg = statusConfig[status] || statusConfig.waiting

  return (
    <div className={`buzzer-page buzzer-active color-${team.color}`}>
      {!connected && (
        <div className="buzzer-reconnect-banner">
          Reconnecting…
        </div>
      )}
      <div className="buzzer-team-header">
        <div className={`buzzer-team-dot color-${team.color}`} />
        <div className="buzzer-team-info">
          <span className="buzzer-team-label">{team.name}</span>
          {name && <span className="buzzer-member-name">{name}</span>}
        </div>
      </div>

      <div className="buzzer-status-label">{cfg.label}</div>
      <div className="buzzer-status-sub">{cfg.sub}</div>

      <button
        className={`buzzer-btn color-${team.color}
          ${status === 'armed' ? 'buzzer-btn-ready' : ''}
          ${status === 'i-buzzed' ? 'buzzer-btn-winner' : ''}
          ${status === 'locked-out' ? 'buzzer-btn-locked' : ''}
          ${cfg.pulse ? 'buzzer-pulse' : ''}
        `}
        onClick={handleBuzz}
        disabled={status !== 'armed'}
      >
        {status === 'waiting'    && '⏳'}
        {status === 'armed'      && '🔔'}
        {status === 'i-buzzed'   && '🏆'}
        {status === 'locked-out' && '🔒'}
      </button>
    </div>
  )
}
