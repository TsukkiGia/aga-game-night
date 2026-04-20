export default function CloseIconButton({
  onClick,
  className = '',
  ariaLabel = 'Close',
  title,
  variant = 'default',
}) {
  const classes = ['close-icon-btn', `close-icon-btn--${variant}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      type="button"
      className={classes}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title || ariaLabel}
    >
      <span aria-hidden="true">×</span>
    </button>
  )
}
