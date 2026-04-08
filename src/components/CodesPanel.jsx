import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import MemberRoster from './MemberRoster'

export default function CodesPanel({ teams, members, buzzerUrl, sessionCode }) {
  const [qrSrc, setQrSrc] = useState('')

  useEffect(() => {
    QRCode.toDataURL(buzzerUrl, { width: 300, margin: 1 }).then(setQrSrc)
  }, [buzzerUrl])

  // Bare URL without protocol for display
  const displayUrl = buzzerUrl.replace(/^https?:\/\//, '')

  return (
    <div className="codes-panel">
      <div className="codes-body">
        <div className="codes-join-row">
          {qrSrc && (
            <a href={buzzerUrl} target="_blank" rel="noreferrer">
              <img className="codes-qr" src={qrSrc} alt="Scan to join" />
            </a>
          )}
          <div className="codes-join-info">
            <div className="codes-join-label">Join the game</div>
            <div className="codes-join-url">{displayUrl}</div>
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
