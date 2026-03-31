import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import MemberRoster from './MemberRoster'

export default function CodesPanel({ teams, members, buzzerUrl }) {
  const [open, setOpen] = useState(true)
  const [qrSrc, setQrSrc] = useState('')

  useEffect(() => {
    QRCode.toDataURL(buzzerUrl, { width: 280, margin: 1 }).then(setQrSrc)
  }, [buzzerUrl])

  return (
    <div className="codes-panel">
      <button className="codes-toggle" onClick={() => setOpen(o => !o)}>
        <span>🔗 Join Buzzer</span>
        <span className="codes-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="codes-body">
          <div className="codes-top">
            {qrSrc && <img className="codes-qr" src={qrSrc} alt="Scan to join" />}
            <p className="codes-hint">
              Scan or go to <strong>{buzzerUrl}</strong> to buzz in
            </p>
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
      )}
    </div>
  )
}
