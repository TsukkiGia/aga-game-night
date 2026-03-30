import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

export default function QRImg({ url }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { width: 140, margin: 1 }).then(setSrc)
  }, [url])
  return src ? <img className="codes-qr" src={src} alt="Scan to join" style={{ margin: '8px auto', display: 'block' }} /> : null
}
