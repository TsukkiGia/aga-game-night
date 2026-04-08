import { useState, useEffect, useRef } from 'react'
import { socket } from '../socket'

// status: 'loading' | 'join' | 'waiting' | 'armed' | 'i-buzzed' | 'team-buzzed' | 'locked-out'

const STORAGE_KEY = 'sankofa_player'
const sessionCode = new URLSearchParams(window.location.search).get('s')?.trim().toUpperCase() || ''

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return null }
}
function savePlayer(teamIndex, name) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ teamIndex, name }))
}
function clearPlayer() {
  localStorage.removeItem(STORAGE_KEY)
}

function isEligibleDuringArmedState(sync, teamIndex) {
  if (!Number.isInteger(teamIndex)) return false
  if (Array.isArray(sync?.allowedTeamIndices)) return sync.allowedTeamIndices.includes(teamIndex)
  return true
}

function deriveStatusFromSync(sync, teamIndex, memberName) {
  if (sync?.buzzedBy !== null && sync?.buzzedBy !== undefined) {
    if (sync.buzzedBy !== teamIndex) return 'locked-out'
    return sync.buzzedMemberName === memberName ? 'i-buzzed' : 'team-buzzed'
  }
  if (sync?.armed) return isEligibleDuringArmedState(sync, teamIndex) ? 'armed' : 'locked-out'
  return 'waiting'
}

export default function BuzzerPage() {
  const [availableTeams, setAvailableTeams] = useState([])
  const [selectedIndex, setSelectedIndex] = useState(null)
  const [name, setName] = useState('')
  const [team, setTeam] = useState(null)
  const [teamIndex, setTeamIndex] = useState(null)
  const [status, setStatus] = useState(() => loadSaved() ? 'loading' : 'join')
  const [connected, setConnected] = useState(true)
  const teamIndexRef = useRef(null)
  const nameRef = useRef('')
  teamIndexRef.current = teamIndex
  nameRef.current = name

  // Effect 1: socket lifecycle
  useEffect(() => {
    socket.connect()

    function onConnect() {
      setConnected(true)

      // Always fetch teams for the join screen
      socket.emit('member:get-teams', sessionCode, (res) => {
        if (res?.teams) setAvailableTeams(res.teams)
      })

      // Auto-rejoin from saved data on initial connect
      const saved = loadSaved()
      if (saved && teamIndexRef.current === null) {
        socket.emit('member:join', sessionCode, saved.teamIndex, saved.name, (res) => {
          if (res?.error) {
            clearPlayer()
            setStatus('join')
            return
          }
          setTeam(res.team)
          setTeamIndex(res.teamIndex)
          setName(saved.name)
          setStatus(deriveStatusFromSync(res.sync, res.teamIndex, saved.name))
        })
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', () => setConnected(false))
    socket.on('game:reset', () => {
      clearPlayer()
      setTeam(null)
      setTeamIndex(null)
      setSelectedIndex(null)
      setStatus('join')
    })
    socket.on('buzz:armed', (payload) => {
      const sync = (payload && typeof payload === 'object')
        ? { ...payload, armed: true, buzzedBy: null, buzzedMemberName: null }
        : { armed: true, buzzedBy: null, buzzedMemberName: null }
      setStatus((prev) => {
        if (prev === 'join' || prev === 'loading') return prev
        return deriveStatusFromSync(sync, teamIndexRef.current, nameRef.current)
      })
    })
    socket.on('buzz:reset', () => setStatus(s => s === 'join' || s === 'loading' ? s : 'waiting'))
    socket.on('buzz:winner', (data) => {
      setStatus(prev => {
        if (prev === 'armed' || prev === 'waiting') {
          if (data.teamIndex !== teamIndexRef.current) return 'locked-out'
          return data.memberName === nameRef.current ? 'i-buzzed' : 'team-buzzed'
        }
        return prev
      })
    })

    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect')
      socket.off('game:reset')
      socket.off('buzz:armed')
      socket.off('buzz:reset')
      socket.off('buzz:winner')
      socket.disconnect()
    }
  }, [])

  // Effect 2: rejoin on reconnect once team is known
  useEffect(() => {
    if (teamIndex === null) return
    function rejoin() {
      const memberName = nameRef.current || 'Anonymous'
      socket.emit('member:join', sessionCode, teamIndex, memberName, (res) => {
        if (res?.error) { clearPlayer(); setStatus('join'); return }
        if (res?.team) setTeam(res.team)
        if (res?.teamIndex !== undefined) {
          setStatus(deriveStatusFromSync(res.sync, res.teamIndex, memberName))
        }
      })
    }
    socket.on('connect', rejoin)
    return () => socket.off('connect', rejoin)
  }, [teamIndex])

  function handleJoin(e) {
    e.preventDefault()
    if (selectedIndex === null) return
    const memberName = name.trim() || 'Anonymous'
    socket.emit('member:join', sessionCode, selectedIndex, memberName, (res) => {
      if (res?.error) return
      savePlayer(res.teamIndex, memberName)
      setTeam(res.team)
      setTeamIndex(res.teamIndex)
      setStatus(deriveStatusFromSync(res.sync, res.teamIndex, memberName))
    })
  }

  function handleBuzz() {
    if (status !== 'armed') return
    socket.emit('member:buzz')
  }

  // ── Loading screen (auto-rejoin in progress) ─────────────────
  if (status === 'loading') {
    return (
      <div className="buzzer-page">
        <div className="buzzer-join-card">
          <div className="buzzer-logo">⏳</div>
          <h1 className="buzzer-title">Reconnecting…</h1>
          <p className="buzzer-sub">Picking up where you left off</p>
        </div>
      </div>
    )
  }

  // ── Join screen ─────────────────────────────────────────────
  if (status === 'join') {
    return (
      <div className="buzzer-page">
        <div className="buzzer-join-card">
          <div className="buzzer-logo">🥁</div>
          <h1 className="buzzer-title">JOIN GAME</h1>
          <p className="buzzer-sub">Pick your team and enter your name</p>
          <form className="buzzer-form" onSubmit={handleJoin}>
            <div className="buzzer-team-select">
              {availableTeams.length === 0 ? (
                <p className="buzzer-no-teams">Waiting for host to start the game…</p>
              ) : (
                availableTeams.map((t, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`buzzer-team-option color-${t.color}${selectedIndex === i ? ' selected' : ''}`}
                    onClick={() => setSelectedIndex(i)}
                  >
                    {t.name}
                  </button>
                ))
              )}
            </div>
            <input
              className="buzzer-name-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              autoComplete="off"
            />
            <button className="buzzer-join-btn" type="submit" disabled={selectedIndex === null || !name.trim()}>
              Join Team →
            </button>
          </form>
        </div>
      </div>
    )
  }

  // ── Buzzer screen ────────────────────────────────────────────
  const statusConfig = {
    waiting:      { label: 'Waiting for host…',      sub: 'Hold tight — the host will arm the buzzers', pulse: false },
    armed:        { label: 'BUZZ NOW!',               sub: 'Be the first to buzz in!',                   pulse: true  },
    'i-buzzed':   { label: 'YOU BUZZED IN!',          sub: 'The host will call on you',                  pulse: false },
    'team-buzzed':{ label: 'YOUR TEAM BUZZED IN!',    sub: 'Your teammate got there first',              pulse: false },
    'locked-out': { label: 'Locked Out',              sub: 'Another team buzzed first',                  pulse: false },
  }
  const cfg = statusConfig[status] || statusConfig.waiting

  return (
    <div className={`buzzer-page buzzer-active color-${team.color}`}>
      {!connected && (
        <div className="buzzer-reconnect-banner">Reconnecting…</div>
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
          ${status === 'armed'       ? 'buzzer-btn-ready'  : ''}
          ${status === 'i-buzzed'    ? 'buzzer-btn-winner' : ''}
          ${status === 'team-buzzed' ? 'buzzer-btn-winner' : ''}
          ${status === 'locked-out'  ? 'buzzer-btn-locked' : ''}
          ${cfg.pulse                ? 'buzzer-pulse'      : ''}
        `}
        onClick={handleBuzz}
        disabled={status !== 'armed'}
      >
        {status === 'waiting'     && '⏳'}
        {status === 'armed'       && '🔔'}
        {status === 'i-buzzed'    && '🏆'}
        {status === 'team-buzzed' && '👥'}
        {status === 'locked-out'  && '🔒'}
      </button>
    </div>
  )
}
