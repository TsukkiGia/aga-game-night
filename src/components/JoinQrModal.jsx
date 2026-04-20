import { useMemo, useState } from 'react'
import QRImg from './QRImg'
import ModalShell from './ModalShell'
import ModalHeader from './ModalHeader'

export default function JoinQrModal({ open, buzzerUrl, onClose }) {
  const [copyState, setCopyState] = useState('idle')

  const { sessionCode, displayHostAndPath } = useMemo(() => {
    try {
      const url = new URL(String(buzzerUrl || ''))
      const code = (url.searchParams.get('s') || '').toUpperCase()
      return {
        sessionCode: code,
        displayHostAndPath: `${url.host}${url.pathname}${url.search}`,
      }
    } catch {
      return { sessionCode: '', displayHostAndPath: String(buzzerUrl || '') }
    }
  }, [buzzerUrl])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(String(buzzerUrl || ''))
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1300)
    } catch {
      setCopyState('error')
      window.setTimeout(() => setCopyState('idle'), 1300)
    }
  }

  if (!open) return null

  return (
    <ModalShell onClose={onClose} dialogClassName="help-popup qv-join-modal">
      <ModalHeader
        className="qv-join-head"
        title="Join This Game"
        titleTag="div"
        titleClassName="qv-join-title"
        onClose={onClose}
        closeAriaLabel="Close join QR"
        closeClassName="qv-join-close"
      />
      <div className="qv-join-body">
        <div className="qv-join-qr-wrap">
          <QRImg url={buzzerUrl} />
        </div>
        <div className="qv-join-meta">
          <div className="qv-join-label">Session Code</div>
          <div className="qv-join-code">{sessionCode || 'NO CODE'}</div>
          <div className="qv-join-url">{displayHostAndPath}</div>
          <div className="qv-join-actions">
            <button type="button" className="qv-join-copy" onClick={handleCopyLink}>
              {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy Link'}
            </button>
            <a className="qv-join-open" href={buzzerUrl} target="_blank" rel="noreferrer">
              Open Join Page
            </a>
          </div>
          <div className="qv-join-shortcut">Shortcut: Shift + J</div>
        </div>
      </div>
    </ModalShell>
  )
}
