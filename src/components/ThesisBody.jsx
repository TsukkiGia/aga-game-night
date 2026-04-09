import Timer from './Timer'

export default function ThesisBody({ question }) {
  const title = String(question?.title || '').trim()
  const options = Array.isArray(question?.options) ? question.options : []
  const isLongTitle = title.length >= 90
  const isVeryLongTitle = title.length >= 130

  return (
    <div
      className={`qv-thesis-wrap${isLongTitle ? ' is-long' : ''}${isVeryLongTitle ? ' is-very-long' : ''}`}
    >
      <div className="qv-thesis-title">{title}</div>
      <div className="qv-thesis-modes">
        <div className="qv-thesis-modes-label">Translate into:</div>
        {options.map(opt => (
          <div key={opt} className="qv-thesis-mode">◈ {opt}</div>
        ))}
      </div>
      <Timer seconds={90} />
    </div>
  )
}
