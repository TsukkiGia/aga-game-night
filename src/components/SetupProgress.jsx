export default function SetupProgress({ steps, current, onStepClick }) {
  if (!Array.isArray(steps) || steps.length === 0) return null
  const currentStep = Number.isInteger(current) ? current : 0
  const canHandleClick = typeof onStepClick === 'function'

  return (
    <nav className="setup-progress" aria-label="Setup progress">
      <ol className="setup-progress-list">
        {steps.map((label, index) => {
          const stepNumber = index + 1
          const complete = stepNumber < currentStep
          const active = stepNumber === currentStep
          const clickable = canHandleClick && stepNumber <= currentStep
          return (
            <li key={`${label}-${stepNumber}`}>
              <button
                type="button"
                className={`setup-progress-item${complete ? ' complete' : ''}${active ? ' active' : ''}${clickable ? ' is-clickable' : ''}`}
                aria-current={active ? 'step' : undefined}
                onClick={() => {
                  if (!clickable) return
                  onStepClick(stepNumber)
                }}
                disabled={!clickable}
              >
                <span className="setup-progress-index">{stepNumber}</span>
                <span className="setup-progress-label">{label}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
