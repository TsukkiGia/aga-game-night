import rounds from '../rounds'

const TYPE_LABEL = { video: 'Video', slang: 'Slang', charades: 'Charades', thesis: 'Thesis' }

export default function QuestionsPicker({ doneQuestions, onSelect, onClose }) {
  return (
    <div className="questions-overlay" onClick={onClose}>
      <div className="questions-panel" onClick={e => e.stopPropagation()}>
        <div className="questions-panel-header">
          <span>Questions</span>
          <button className="questions-panel-close" onClick={onClose}>✕</button>
        </div>
        <div className="questions-panel-body">
          {rounds.map((round, rIdx) => (
            <div key={rIdx} className="qp-round">
              <button
                className="qp-round-header"
                onClick={() => onSelect(rIdx, null)}
              >
                {round.label} — {round.name}
              </button>
              <div className="qp-questions-list">
                {round.questions.map((q, qIdx) => {
                  const done = doneQuestions.has(`${rIdx}-${qIdx}`)
                  return (
                    <button
                      key={qIdx}
                      className={`qp-question-btn${done ? ' done' : ''}`}
                      onClick={() => onSelect(rIdx, qIdx)}
                    >
                      {done ? '✓ ' : ''}{TYPE_LABEL[round.type]} {qIdx + 1}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
