export default function SetupProgress({ steps, current }) {
  if (!Array.isArray(steps) || steps.length === 0) return null
  const currentStep = Number.isInteger(current) ? current : 0

  return (
    <nav className="setup-progress" aria-label="Setup progress">
      <ol className="setup-progress-list">
        {steps.map((label, index) => {
          const stepNumber = index + 1
          const complete = stepNumber < currentStep
          const active = stepNumber === currentStep
          return (
            <li
              key={`${label}-${stepNumber}`}
              className={`setup-progress-item${complete ? ' complete' : ''}${active ? ' active' : ''}`}
              aria-current={active ? 'step' : undefined}
            >
              <span className="setup-progress-index">{stepNumber}</span>
              <span className="setup-progress-label">{label}</span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

