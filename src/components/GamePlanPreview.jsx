import { useMemo, useState } from 'react'
import {
  questionPreviewAnswer,
  questionPreviewDetail,
  questionPreviewHeadline,
  questionPreviewTags,
} from './game-config/helpers'
import { QuestionPreviewMedia } from './game-config/MediaPreviewBlocks'

export default function GamePlanPreview({
  roundCatalog,
  onBack,
  onContinue,
}) {
  const rounds = useMemo(
    () => (Array.isArray(roundCatalog) ? roundCatalog : []).filter((round) => Array.isArray(round?.questions) && round.questions.length > 0),
    [roundCatalog]
  )

  const totalQuestions = useMemo(
    () => rounds.reduce((sum, round) => sum + round.questions.length, 0),
    [rounds]
  )
  const [expandedRoundIds, setExpandedRoundIds] = useState(() => new Set())

  function toggleRoundCollapsed(roundKey) {
    setExpandedRoundIds((prev) => {
      const next = new Set(prev)
      if (next.has(roundKey)) next.delete(roundKey)
      else next.add(roundKey)
      return next
    })
  }

  return (
    <div className="setup-container">
      <div className="setup-step game-plan-preview-step">
        <div className="setup-icon">🎬</div>
        <h2 className="setup-heading">Game Preview</h2>
        <p className="setup-sub">
          Final check before lobby. This is exactly what will run in this session.
        </p>

        <div className="game-plan-preview-metrics">
          <div className="game-plan-preview-metric">
            <span>Rounds</span>
            <strong>{rounds.length}</strong>
          </div>
          <div className="game-plan-preview-metric">
            <span>Questions</span>
            <strong>{totalQuestions}</strong>
          </div>
        </div>

        <div className="game-plan-preview-rounds">
          {rounds.map((round, roundIndex) => {
            const roundKey = String(round?.id || `preview-round-${roundIndex}`)
            const collapsed = !expandedRoundIds.has(roundKey)
            return (
            <section key={roundKey} className={`game-plan-preview-round type-${round.type}`}>
              <header className="game-plan-preview-round-head">
                <div className="game-plan-preview-round-head-top">
                  <span className="game-plan-preview-round-pill">{`Round ${roundIndex + 1}`}</span>
                  <button
                    type="button"
                    className="game-plan-preview-collapse-btn"
                    onClick={() => toggleRoundCollapsed(roundKey)}
                    aria-expanded={!collapsed}
                    aria-controls={`${roundKey}-questions`}
                  >
                    {collapsed ? 'Expand' : 'Collapse'}
                  </button>
                </div>
                <h3>{round.name || `Round ${roundIndex + 1}`}</h3>
                <p>{round.questions.length} question{round.questions.length === 1 ? '' : 's'}</p>
              </header>

              {!collapsed && (
              <div className="game-plan-preview-question-list" id={`${roundKey}-questions`}>
                {round.questions.map((question, questionIndex) => {
                  const headline = questionPreviewHeadline(round, question, questionIndex)
                  const detail = questionPreviewDetail(round, question)
                  const answer = questionPreviewAnswer(round, question)
                  const tags = questionPreviewTags(round, question)
                  return (
                    <article
                      key={question?.id || `${round.id || roundIndex}-q-${questionIndex + 1}`}
                      className="game-plan-preview-question"
                    >
                      <div className="game-plan-preview-question-top">
                        <span className="game-plan-preview-q-pill">Q{questionIndex + 1}</span>
                        {tags.length > 0 && (
                          <div className="game-plan-preview-tags">
                            {tags.slice(0, 3).map((tag, tagIndex) => (
                              <span key={`${questionIndex}-tag-${tagIndex}`}>{tag}</span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="game-plan-preview-question-title">{headline}</div>
                      <QuestionPreviewMedia
                        key={`${String(question?.id || questionIndex)}:${String(question?.promptType || '')}:${String(question?.mediaUrl || question?.video || '')}`}
                        round={round}
                        question={question}
                      />
                      {answer && (
                        <div className="game-plan-preview-answer">
                          <span>Answer</span>
                          <strong>{answer}</strong>
                        </div>
                      )}
                      {detail && <div className="game-plan-preview-detail">{detail}</div>}
                    </article>
                  )
                })}
              </div>
              )}
            </section>
          )})}
        </div>

        <div className="setup-actions">
          <button type="button" className="back-btn" onClick={onBack}>← Back to Game Plan</button>
          <button type="button" className="start-btn" onClick={onContinue}>Continue to Companion →</button>
        </div>
      </div>
    </div>
  )
}
