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
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M6 6L18 18" />
        <path d="M18 6L6 18" />
      </svg>
    </button>
  )
}
