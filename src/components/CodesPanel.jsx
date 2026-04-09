import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import MemberRoster from './MemberRoster'

export default function CodesPanel({ teams, members, buzzerUrl }) {
  const [qrSrc, setQrSrc] = useState('')
  const [copyState, setCopyState] = useState('idle')

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
      <div className="codes-body">
        <div className="codes-join-row">
          {qrSrc && (
            <a className="codes-qr-link" href={buzzerUrl} target="_blank" rel="noreferrer" aria-label="Open join page">
              <img className="codes-qr" src={qrSrc} alt="Scan to join" />
            </a>
          )}
          <div className="codes-join-info">
            <div className="codes-join-eyebrow">Scan to join the game</div>

            <div className="codes-session-card">
              <div className="codes-session-label">Session Code</div>
              <div className="codes-session-code">{sessionCode || 'NO CODE'}</div>
            </div>

            <div className="codes-join-actions">
              <button className="codes-copy-btn" onClick={handleCopyLink}>
                {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy Link'}
              </button>
              <a className="codes-open-link" href={buzzerUrl} target="_blank" rel="noreferrer">
                Open Join Page
              </a>
            </div>

            <div className="codes-join-meta">{displayHostAndPath}</div>
          </div>
        </div>

        <div className="codes-grid">
          {teams.map((t, i) => (
            <div key={i} className={`code-chip color-${t.color}`}>
              <span className="code-team-name">{t.name}</span>
              <MemberRoster members={members?.[i] || []} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
