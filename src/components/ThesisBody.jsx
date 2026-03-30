import Timer from './Timer'

export default function ThesisBody({ question }) {
  return (
    <div className="qv-thesis-wrap">
      <div className="qv-thesis-title">{question.title}</div>
      <div className="qv-thesis-modes">
        <div className="qv-thesis-modes-label">Translate into:</div>
        {question.options.map(opt => (
          <div key={opt} className="qv-thesis-mode">◈ {opt}</div>
        ))}
      </div>
      <Timer seconds={90} />
    </div>
  )
}
