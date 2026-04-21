export default function IconRemoveButton({
  onClick,
  ariaLabel = 'Remove',
  className = 'game-config-remove-btn game-config-remove-btn-sm',
  disabled = false,
  title,
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      title={title || ariaLabel}
      disabled={disabled}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
        <path d="M6 6L18 18" />
        <path d="M18 6L6 18" />
      </svg>
    </button>
  )
}
