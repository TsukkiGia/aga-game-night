export default function ModalShell({
  onClose = () => {},
  children,
  overlayClassName = 'help-overlay',
  dialogClassName = '',
  closeOnOverlayClick = true,
  role = 'dialog',
  ariaModal = true,
}) {
  const overlayClasses = [overlayClassName].filter(Boolean).join(' ')
  const dialogClasses = [dialogClassName].filter(Boolean).join(' ')

  return (
    <div
      className={overlayClasses}
      role={role}
      aria-modal={ariaModal ? 'true' : undefined}
      onClick={() => { if (closeOnOverlayClick) onClose() }}
    >
      <div className={dialogClasses} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}
