import CloseIconButton from './CloseIconButton'

export default function ModalHeader({
  className = 'help-popup-head',
  contentClassName = '',
  kicker = '',
  kickerClassName = 'help-popup-tag',
  title = '',
  titleTag = 'h2',
  titleClassName = 'help-popup-title',
  subtitle = '',
  subtitleClassName = '',
  onClose = null,
  closeAriaLabel = 'Close',
  closeClassName = '',
  closeVariant = 'default',
  right = null,
}) {
  const TitleTag = titleTag

  return (
    <div className={className}>
      <div className={contentClassName || undefined}>
        {kicker ? <div className={kickerClassName}>{kicker}</div> : null}
        {title ? <TitleTag className={titleClassName}>{title}</TitleTag> : null}
        {subtitle ? <p className={subtitleClassName}>{subtitle}</p> : null}
      </div>
      {right || (onClose ? (
        <CloseIconButton
          onClick={onClose}
          ariaLabel={closeAriaLabel}
          className={closeClassName}
          variant={closeVariant}
        />
      ) : null)}
    </div>
  )
}
