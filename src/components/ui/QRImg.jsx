import { useState, useEffect } from 'react'
import QRCode from 'qrcode'

export default function QRImg({ url, size = 140, className = 'codes-qr', alt = 'Scan to join', style }) {
  const [src, setSrc] = useState('')
  useEffect(() => {
    QRCode.toDataURL(url, { width: size, margin: 1 }).then(setSrc)
  }, [size, url])
  return src ? (
    <img
      className={className}
      src={src}
      alt={alt}
      style={{ margin: '8px auto', display: 'block', ...style }}
    />
  ) : null
}
