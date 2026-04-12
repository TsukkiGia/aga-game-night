import roundsData from '../rounds'
import { buildPlanCatalog, questionItemIdFor } from '../gamePlan'

const TYPE_LABEL = { video: 'Video', slang: 'Slang', charades: 'Charades', thesis: 'Thesis', 'custom-buzz': 'Question' }

export default function QuestionsPicker({ doneQuestions = new Set(), rounds = roundsData, planCatalog = null, onSelect, onClose }) {
  const effectiveCatalog = planCatalog || buildPlanCatalog(rounds)

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
                  const itemId = questionItemIdFor(rIdx, qIdx, effectiveCatalog)
                  const done = Boolean(
                    (itemId && doneQuestions.has(itemId)) ||
                    doneQuestions.has(`${rIdx}-${qIdx}`)
                  )
                  return (
                    <button
                      key={qIdx}
                      className={`qp-question-btn${done ? ' done' : ''}`}
                      onClick={() => onSelect(rIdx, qIdx)}
                    >
                      {done ? '✓ ' : ''}{TYPE_LABEL[round.type] || 'Q'} {qIdx + 1}
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
