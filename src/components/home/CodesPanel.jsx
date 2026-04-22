import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { isHostlessMode, GAMEPLAY_MODE_HOSTED, GAMEPLAY_MODE_HOSTLESS } from '../../core/gameplayMode'

export default function CodesPanel({
  teams,
  members,
  buzzerUrl,
  gameplayMode = GAMEPLAY_MODE_HOSTED,
  onGameplayModeChange = () => {},
  gameplayModeSwitching = false,
}) {
  const [qrSrc, setQrSrc] = useState('')
  const [copyState, setCopyState] = useState('idle')
  const hostlessModeActive = isHostlessMode(gameplayMode)

  useEffect(() => {
    QRCode.toDataURL(buzzerUrl, { width: 300, margin: 1 }).then(setQrSrc)
  }, [buzzerUrl])

  const { sessionCode, displayHostAndPath } = useMemo(() => {
    try {
      const url = new URL(buzzerUrl)
      const code = (url.searchParams.get('s') || '').toUpperCase()
      return {
        sessionCode: code,
        displayHostAndPath: `${url.host}${url.pathname}${url.search}`,
      }
    } catch {
      return { sessionCode: '', displayHostAndPath: buzzerUrl }
    }
  }, [buzzerUrl])

  const joinedCount = useMemo(() => (
    Array.isArray(members)
      ? members.reduce((sum, roster) => sum + (Array.isArray(roster) ? roster.length : 0), 0)
      : 0
  ), [members])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(buzzerUrl)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1300)
    } catch {
      try {
        const input = document.createElement('input')
        input.value = buzzerUrl
        document.body.appendChild(input)
        input.select()
        document.execCommand('copy')
        document.body.removeChild(input)
        setCopyState('copied')
      } catch {
        setCopyState('error')
      }
      window.setTimeout(() => setCopyState('idle'), 1300)
    }
  }

  return (
    <div className="codes-panel">
      <aside className="codes-rail">
        <div className="codes-rail-kente" />
        <div className="codes-rail-content">
          <div className="codes-join-eyebrow">Scan to join</div>
          <h2 className="codes-rail-title">Lock in.</h2>
          <p className="codes-rail-sub">Point your camera. Pick a team.</p>

          {qrSrc && (
            <a className="codes-qr-link" href={buzzerUrl} target="_blank" rel="noreferrer" aria-label="Open join page">
              <img className="codes-qr" src={qrSrc} alt="Scan to join" />
            </a>
          )}

          <div className="codes-session-label">Session Code</div>
          <div className="codes-session-code">{sessionCode || 'NO CODE'}</div>
          <div className="codes-join-meta">{displayHostAndPath} · {sessionCode || 'NO CODE'}</div>
        </div>
        <div className="codes-rail-actions">
          <button className="codes-copy-btn" onClick={handleCopyLink}>
            {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : '📋 Copy link'}
          </button>
          <a className="codes-open-link" href={buzzerUrl} target="_blank" rel="noreferrer">
            Open join page
          </a>
        </div>
      </aside>

      <section className="codes-main">
        <div className="codes-main-head">
          <div className="codes-main-title-wrap">
            <h2 className="codes-main-title">Teams</h2>
            <div className="codes-main-meta">
              {joinedCount} {joinedCount === 1 ? 'player' : 'players'} joined · {teams.length} teams
            </div>
          </div>
          <div className="codes-main-head-right">
            <div
              className={`home-mode-toggle${hostlessModeActive ? ' hostless' : ''}${gameplayModeSwitching ? ' switching' : ''}`}
              role="group"
              aria-label="Gameplay mode"
            >
              <button
                type="button"
                className={`home-mode-toggle-btn${!hostlessModeActive ? ' active' : ''}`}
                onClick={() => { if (!gameplayModeSwitching) onGameplayModeChange(GAMEPLAY_MODE_HOSTED) }}
                aria-disabled={gameplayModeSwitching}
              >
                Hosted
              </button>
              <button
                type="button"
                className={`home-mode-toggle-btn${hostlessModeActive ? ' active' : ''}`}
                onClick={() => { if (!gameplayModeSwitching) onGameplayModeChange(GAMEPLAY_MODE_HOSTLESS) }}
                aria-disabled={gameplayModeSwitching}
              >
                Host-less
              </button>
            </div>
            <div className="codes-live-pill">
              <span className="codes-live-dot" aria-hidden="true" />
              <span>Live</span>
            </div>
          </div>
        </div>

        <div className="codes-grid">
          {teams.map((t, i) => (
            <div key={i} className={`home-team-card color-${t.color}`}>
              <div className="home-team-card-head">
                <span className="home-team-index">{i + 1}</span>
                <span className="home-team-name">{t.name}</span>
              </div>
              <div className="home-team-count">
                {Array.isArray(members?.[i]) ? members[i].length : 0} {((Array.isArray(members?.[i]) ? members[i].length : 0) === 1) ? 'PLAYER' : 'PLAYERS'}
              </div>
              <div className="home-team-members">
                {Array.isArray(members?.[i]) && members[i].length > 0 ? (
                  <>
                    {members[i].slice(0, 4).map((name, memberIndex) => (
                      <span key={`${t.name}-${name}-${memberIndex}`} className="home-team-member-pill">{name}</span>
                    ))}
                    {members[i].length > 4 && (
                      <span className="home-team-member-pill">+{members[i].length - 4}</span>
                    )}
                  </>
                ) : (
                  <span className="home-team-member-empty">No players yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
