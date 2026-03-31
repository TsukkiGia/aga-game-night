import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

export default function CodesPanel({ teams, members, buzzerUrl }) {
  const [open, setOpen] = useState(true)
  const [qrSrc, setQrSrc] = useState('')

  useEffect(() => {
    QRCode.toDataURL(buzzerUrl, { width: 240, margin: 1 }).then(setQrSrc)
  }, [buzzerUrl])

  return (
    <div className="codes-panel">
      <button className="codes-toggle" onClick={() => setOpen(o => !o)}>
        <span>🔗 Team Buzzer Codes</span>
        <span className="codes-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="codes-body">
          <div className="codes-top">
            {qrSrc && <img className="codes-qr" src={qrSrc} alt="Scan to join" />}
            <p className="codes-hint">
              Scan or go to <strong>{buzzerUrl}</strong> and enter your team code to buzz in
            </p>
          </div>
          <div className="codes-grid">
            {teams.map((t, i) => (
              <div key={t.code} className={`code-chip color-${t.color}`}>
                <span className="code-team-name">{t.name}</span>
                <span className="code-value">{t.code}</span>
                {members[i]?.length > 0 && (
                  <span className="code-members">{members[i].join(', ')}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
