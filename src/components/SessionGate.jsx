import { useEffect, useState } from 'react'
import { SESSION_CODE_KEY, HOST_PIN_KEY } from '../storage'

function getStored(key) {
  try { return sessionStorage.getItem(key) || '' } catch { return '' }
}
function setStored(key, val) {
  try { sessionStorage.setItem(key, val) } catch { /* ignore */ }
}
function clearStored(...keys) {
  try { keys.forEach(k => sessionStorage.removeItem(k)) } catch { /* ignore */ }
}

// 'create' | 'resume'
export default function SessionGate({ onSession }) {
  const [mode, setMode] = useState('pick')

  const [pin, setPin]           = useState('')
  const [resumeCode, setResumeCode] = useState('')
  const [resumePin, setResumePin]   = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    const code = getStored(SESSION_CODE_KEY)
    const savedPin = getStored(HOST_PIN_KEY)
    if (!code || !savedPin) return
    setMode('restoring')
    onSession(code, savedPin)
  }, [onSession])

  async function handleCreate(e) {
    e.preventDefault()
    const trimmed = pin.trim()
    if (trimmed.length < 4) { setError('PIN must be at least 4 digits'); return }
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: trimmed }),
      })
      const data = await res.json()
      if (!res.ok || !data.sessionCode) {
        setError(data.error === 'invalid-pin' ? 'PIN must be 4–8 digits' : 'Could not create session. Try again.')
        return
      }
      setStored(SESSION_CODE_KEY, data.sessionCode)
      setStored(HOST_PIN_KEY, trimmed)
      onSession(data.sessionCode, trimmed)
    } catch {
      setError('Network error. Is the server running?')
    } finally {
      setLoading(false)
    }
  }

  function handleResume(e) {
    e.preventDefault()
    const code = resumeCode.trim().toUpperCase()
    const p    = resumePin.trim()
    if (!code) { setError('Enter a session code'); return }
    if (!p)    { setError('Enter your PIN'); return }
    clearStored(SESSION_CODE_KEY, HOST_PIN_KEY)
    setStored(SESSION_CODE_KEY, code)
    setStored(HOST_PIN_KEY, p)
    // Actual PIN verification happens in useGameSocket when host:auth fires
    onSession(code, p)
  }

  return (
    <div className="setup-container">
      <div className="setup-step">
        {mode === 'restoring' && (
          <>
            <div className="setup-icon">🔄</div>
            <h2 className="setup-heading">Reconnecting…</h2>
            <p className="setup-sub">Restoring your previous host session</p>
          </>
        )}

        {mode === 'pick' && (
          <>
            <div className="setup-icon">🎮</div>
            <h2 className="setup-heading">Sankofa Showdown</h2>
            <p className="setup-sub">Start a new game session or resume an existing one</p>
            <div className="session-gate-actions">
              <button className="start-btn" onClick={() => { setError(''); setMode('create') }}>
                New Session
              </button>
              <button className="back-btn" onClick={() => { setError(''); setMode('resume') }}>
                Resume Session
              </button>
            </div>
          </>
        )}

        {mode === 'create' && (
          <>
            <div className="setup-icon">🔐</div>
            <h2 className="setup-heading">Create Session</h2>
            <p className="setup-sub">Choose a PIN for this session — you'll need it to reconnect</p>
            <form className="session-gate-form" onSubmit={handleCreate}>
              <input
                className="team-name-input session-gate-input"
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="PIN (4–8 digits)"
                maxLength={8}
                autoFocus
              />
              {error && <p className="session-gate-error">{error}</p>}
              <div className="setup-actions">
                <button type="button" className="back-btn" onClick={() => { setError(''); setMode('pick') }}>← Back</button>
                <button type="submit" className="start-btn" disabled={loading}>
                  {loading ? 'Creating…' : 'Create →'}
                </button>
              </div>
            </form>
          </>
        )}

        {mode === 'resume' && (
          <>
            <div className="setup-icon">🔑</div>
            <h2 className="setup-heading">Resume Session</h2>
            <p className="setup-sub">Enter your session code and PIN</p>
            <form className="session-gate-form" onSubmit={handleResume}>
              <input
                className="team-name-input session-gate-input"
                type="text"
                value={resumeCode}
                onChange={e => setResumeCode(e.target.value.toUpperCase())}
                placeholder="Session code (e.g. XK4F2M)"
                maxLength={6}
                autoFocus
                autoComplete="off"
              />
              <input
                className="team-name-input session-gate-input"
                type="password"
                inputMode="numeric"
                value={resumePin}
                onChange={e => setResumePin(e.target.value)}
                placeholder="PIN"
                maxLength={8}
              />
              {error && <p className="session-gate-error">{error}</p>}
              <div className="setup-actions">
                <button type="button" className="back-btn" onClick={() => { setError(''); setMode('pick') }}>← Back</button>
                <button type="submit" className="start-btn">Resume →</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
