import { useMemo, useState } from 'react'
import { ENDPOINT } from '../config'
import QRImg from './QRImg'

export default function CompanionSetup({ sessionCode, onContinue, onBack }) {
  const [copied, setCopied] = useState(false)

  const hostCompanionUrl = useMemo(() => {
    const base = ENDPOINT || window.location.origin
    const code = String(sessionCode || '').trim().toUpperCase()
    return `${base}/host-mobile${code ? `?s=${encodeURIComponent(code)}` : ''}`
  }, [sessionCode])

  async function handleCopy() {
    if (!navigator?.clipboard?.writeText) return
    try {
      await navigator.clipboard.writeText(hostCompanionUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Ignore clipboard failures silently.
    }
  }

  return (
    <div className="setup-container">
      <div className="setup-step companion-setup-step">
        <div className="setup-icon">📱</div>
        <h2 className="setup-heading">Connect Host Companion</h2>
        <p className="setup-sub">
          Scan this QR on your phone/tablet so the host can see answers and run timer/sound controls.
        </p>

        <div className="companion-setup-card">
          <a href={hostCompanionUrl} target="_blank" rel="noreferrer" className="companion-setup-qr-link">
            <QRImg
              url={hostCompanionUrl}
              size={176}
              className="companion-setup-qr-img"
              alt="Scan to open host companion"
              style={{ margin: 0 }}
            />
          </a>
          <div className="companion-setup-meta">
            <div className="companion-setup-label">Session Code</div>
            <div className="companion-setup-code">{sessionCode || 'NO CODE'}</div>
            <div className="companion-setup-copy">
              Open this on your companion device, then sign in with the same session code and host PIN.
            </div>
            <div className="companion-setup-inline-actions">
              <button type="button" className="back-btn" onClick={handleCopy}>
                {copied ? 'Copied' : 'Copy Link'}
              </button>
              <a
                className="back-btn companion-setup-open-link"
                href={hostCompanionUrl}
                target="_blank"
                rel="noreferrer"
              >
                Open Companion
              </a>
            </div>
          </div>
        </div>

        <div className="setup-actions">
          <button type="button" className="back-btn" onClick={onBack}>← Back to Game Plan</button>
          <button type="button" className="start-btn" onClick={onContinue}>Continue to Lobby →</button>
        </div>
      </div>
    </div>
  )
}
