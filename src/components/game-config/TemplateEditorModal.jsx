import { mediaUrlFeedback } from '../../utils/mediaPrompt'
import { DEFAULT_QUESTION } from './constants'
import { cloneJson } from './helpers'
import { MediaPreview } from './MediaPreviewBlocks'

export default function TemplateEditorModal({
  creatorMode,
  isEditorDirty,
  newTemplateName,
  setNewTemplateName,
  newTemplateIntro,
  setNewTemplateIntro,
  newTemplateRules,
  setNewTemplateRules,
  newTemplateScoring,
  setNewTemplateScoring,
  newTemplateQuestions,
  setNewTemplateQuestions,
  createError,
  inlineValidationError,
  canSubmitCreator,
  createSubmitting,
  onCloseCreator,
  onSaveSessionRoundEdits,
  onCreateTemplate,
  nextQuestionId,
}) {
  return (
    <div className="help-overlay">
      <div className="help-popup game-config-template-modal" onClick={(e) => e.stopPropagation()}>
        <div className="game-config-template-header">
          {creatorMode === 'session-edit' && (
            <div className="game-config-template-header-actions">
              <button
                type="button"
                className="game-config-template-header-back"
                onClick={() => onCloseCreator({ returnToPreview: true })}
              >
                ← Back to Preview
              </button>
            </div>
          )}
          <div className="help-popup-tag">
            {creatorMode === 'create' ? 'Create Custom Round' : 'Edit For This Game'}
          </div>
          <h3 className="help-popup-title">
            {creatorMode === 'create' ? 'Custom Buzz Template' : 'Round Session Copy'}
          </h3>
          <p className="help-popup-sub">
            {creatorMode === 'create'
              ? 'Build a reusable buzz round with text, image, or video prompts.'
              : 'These edits apply only to this game session. The shared template library stays unchanged.'}
          </p>
          <div className={`game-config-template-dirty${isEditorDirty ? ' dirty' : ''}`}>
            {isEditorDirty ? 'Unsaved changes' : 'No unsaved changes'}
          </div>
        </div>

        <div className="game-config-template-body">
          <div className="game-config-template-section">
            <div className="game-config-template-section-head"><span>Details</span></div>
            <div className="game-config-template-field-stack">
              <label className="game-config-field-label">
                Name
                <input
                  className="team-name-input game-config-field"
                  type="text"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  maxLength={120}
                  placeholder="Name this round"
                />
              </label>
              <label className="game-config-field-label">
                Intro
                <textarea
                  className="team-name-input game-config-field game-config-template-textarea"
                  value={newTemplateIntro}
                  onChange={(e) => setNewTemplateIntro(e.target.value)}
                  maxLength={2000}
                  placeholder="Short intro shown at round start (optional)"
                />
              </label>
            </div>
          </div>

          <div className="game-config-template-section">
            <div className="game-config-template-section-head">
              <span>Rules</span>
            </div>
            {newTemplateRules.map((rule, idx) => (
              <div key={`rule-${idx}`} className="game-config-template-row">
                <input
                  className="team-name-input game-config-field"
                  type="text"
                  value={rule}
                  onChange={(e) => setNewTemplateRules((prev) => prev.map((item, i) => (i === idx ? e.target.value : item)))}
                  placeholder={`Rule ${idx + 1}`}
                />
                <button
                  type="button"
                  className="game-config-remove-btn"
                  onClick={() => setNewTemplateRules((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                  aria-label="Remove rule"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="game-config-add-row-btn"
              onClick={() => setNewTemplateRules((prev) => [...prev, ''])}
            >
              + Rule
            </button>
          </div>

          <div className="game-config-template-section">
            <div className="game-config-template-section-head">
              <span>Scoring</span>
            </div>
            <div className="game-config-score-col-heads">
              <span>Label</span>
              <span>Points</span>
              <span>Phase</span>
            </div>
            {newTemplateScoring.map((row, idx) => (
              <div key={`score-${idx}`} className="game-config-template-row game-config-template-row-score">
                <input
                  className="team-name-input game-config-field"
                  type="text"
                  value={row.label}
                  onChange={(e) => setNewTemplateScoring((prev) => prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item)))}
                  placeholder="e.g. Correct answer"
                />
                <input
                  className="team-name-input game-config-field game-config-points-input"
                  type="number"
                  value={row.points}
                  onChange={(e) => setNewTemplateScoring((prev) => prev.map((item, i) => {
                    if (i !== idx) return item
                    const parsed = Number.parseInt(e.target.value, 10)
                    return { ...item, points: Number.isInteger(parsed) ? parsed : 0 }
                  }))}
                  placeholder="0"
                />
                <select
                  className="team-name-input game-config-field game-config-select"
                  value={row.phase}
                  onChange={(e) => setNewTemplateScoring((prev) => prev.map((item, i) => (i === idx ? { ...item, phase: e.target.value } : item)))}
                >
                  <option value="normal">Normal buzz</option>
                  <option value="steal">Steal</option>
                </select>
                <button
                  type="button"
                  className="game-config-remove-btn"
                  onClick={() => setNewTemplateScoring((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                  aria-label="Remove scoring row"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="game-config-add-row-btn"
              onClick={() => setNewTemplateScoring((prev) => [...prev, { label: '', points: 0, phase: 'normal' }])}
            >
              + Score Row
            </button>
          </div>

          <div className="game-config-template-section">
            <div className="game-config-template-section-head">
              <span>Questions</span>
            </div>
            {newTemplateQuestions.map((question, idx) => {
              const urlFeedback = mediaUrlFeedback(question)
              return (
                <div key={`question-${idx}`} className="game-config-template-question-card">
                  <div className="game-config-template-question-head">
                    <span className="game-config-template-q-label">Q{idx + 1}</span>
                    <button
                      type="button"
                      className="game-config-remove-btn"
                      onClick={() => setNewTemplateQuestions((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))}
                      aria-label="Remove question"
                    >
                      ×
                    </button>
                  </div>
                  <label className="game-config-field-label">
                    <span className="game-config-field-label-row">
                      Prompt type
                      <span
                        className="game-config-inline-help game-config-tooltip-trigger"
                        role="note"
                        data-tooltip="Text shows written prompt only. Image shows a URL image plus optional caption. Video plays a URL video plus optional caption."
                        aria-label="Prompt type help"
                        tabIndex={0}
                      >
                        ?
                      </span>
                    </span>
                    <select
                      className="team-name-input game-config-field game-config-select"
                      value={question.promptType}
                      onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (
                        i === idx
                          ? { ...item, promptType: e.target.value, mediaUrl: '', promptText: '' }
                          : item
                      )))}
                    >
                      <option value="text">Text</option>
                      <option value="image">Image</option>
                      <option value="video">Video</option>
                    </select>
                  </label>
                  {question.promptType === 'text' ? (
                    <input
                      className="team-name-input game-config-field"
                      type="text"
                      value={question.promptText}
                      onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, promptText: e.target.value } : item)))}
                      placeholder="Prompt text"
                    />
                  ) : (
                    <>
                      <input
                        className="team-name-input game-config-field"
                        type="text"
                        value={question.promptText}
                        onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, promptText: e.target.value } : item)))}
                        placeholder="Optional caption"
                      />
                      <input
                        className="team-name-input game-config-field"
                        type="url"
                        value={question.mediaUrl}
                        onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, mediaUrl: e.target.value } : item)))}
                        placeholder={question.promptType === 'image' ? 'Image URL (https://...)' : 'Video URL (https://... or YouTube link)'}
                      />
                      {urlFeedback && (
                        <div className={`game-config-url-feedback status-${urlFeedback.kind}`}>
                          {urlFeedback.message}
                        </div>
                      )}
                      <MediaPreview
                        key={`${question.promptType}:${String(question.mediaUrl || '').trim()}`}
                        promptType={question.promptType}
                        mediaUrl={question.mediaUrl}
                      />
                    </>
                  )}
                  <input
                    className="team-name-input game-config-field"
                    type="text"
                    value={question.answer}
                    onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, answer: e.target.value } : item)))}
                    placeholder="Correct answer"
                  />
                  <textarea
                    className="team-name-input game-config-field game-config-template-textarea"
                    value={question.explanation}
                    onChange={(e) => setNewTemplateQuestions((prev) => prev.map((item, i) => (i === idx ? { ...item, explanation: e.target.value } : item)))}
                    placeholder="Explanation (optional, shown after reveal)"
                  />
                </div>
              )
            })}
            <button
              type="button"
              className="game-config-add-row-btn"
              onClick={() => setNewTemplateQuestions((prev) => [...prev, { ...cloneJson(DEFAULT_QUESTION), id: nextQuestionId() }])}
            >
              + Question
            </button>
          </div>
        </div>

        {createError && <p className="session-gate-error game-config-template-error">{createError}</p>}
        {!createError && inlineValidationError && isEditorDirty && (
          <p className="game-config-template-hint">Fix before saving: {inlineValidationError}</p>
        )}

        <div className="setup-actions game-config-template-footer">
          <button
            type="button"
            className="back-btn"
            onClick={() => onCloseCreator()}
            disabled={createSubmitting}
          >
            {creatorMode === 'session-edit' ? 'Back to Preview' : 'Cancel'}
          </button>
          <button
            type="button"
            className="start-btn"
            onClick={() => {
              if (creatorMode === 'session-edit') onSaveSessionRoundEdits()
              else void onCreateTemplate()
            }}
            disabled={!canSubmitCreator}
          >
            {creatorMode === 'session-edit'
              ? 'Save Session Round'
              : (createSubmitting ? 'Creating...' : 'Create Template')}
          </button>
        </div>
      </div>
    </div>
  )
}

