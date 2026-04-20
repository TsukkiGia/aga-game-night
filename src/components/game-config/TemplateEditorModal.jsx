import { useState } from 'react'
import { mediaUrlFeedback } from '../../utils/mediaPrompt'
import { DEFAULT_QUESTION } from './constants'
import { cloneJson } from './helpers'
import { MediaPreview } from './MediaPreviewBlocks'
import CloseIconButton from '../CloseIconButton'
import ModalShell from '../ModalShell'
import ModalHeader from '../ModalHeader'
import IconRemoveButton from '../IconRemoveButton'

function PointsInput({ value, onChange }) {
  const [draft, setDraft] = useState(null)
  const text = draft ?? String(value)

  return (
    <input
      className="team-name-input game-config-field game-config-points-input"
      type="text"
      inputMode="numeric"
      value={text}
      onFocus={() => setDraft(String(value))}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        const raw = e.target.value
        setDraft(raw)
        const parsed = Number.parseInt(raw, 10)
        if (Number.isInteger(parsed)) onChange(parsed)
      }}
    />
  )
}

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
  const [selectedQIdx, setSelectedQIdx] = useState(0)
  const [rulesOpen, setRulesOpen] = useState(true)
  const [scoringOpen, setScoringOpen] = useState(true)
  const [deleteConfirmIdx, setDeleteConfirmIdx] = useState(null)

  const safeIdx = Math.min(selectedQIdx, newTemplateQuestions.length - 1)
  const selectedQ = newTemplateQuestions[safeIdx] ?? null

  function updateQuestion(idx, patch) {
    setNewTemplateQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, ...patch } : q))
  }

  function addQuestion() {
    const newQ = { ...cloneJson(DEFAULT_QUESTION), id: nextQuestionId() }
    setNewTemplateQuestions((prev) => [...prev, newQ])
    setSelectedQIdx(newTemplateQuestions.length)
  }

  function removeQuestion(idx) {
    if (newTemplateQuestions.length <= 1) return
    setNewTemplateQuestions((prev) => prev.filter((_, i) => i !== idx))
    setSelectedQIdx((prev) => Math.min(prev, newTemplateQuestions.length - 2))
  }

  const urlFeedback = selectedQ ? mediaUrlFeedback(selectedQ) : null

  return (
    <ModalShell onClose={onCloseCreator} closeOnOverlayClick={false} dialogClassName="tpl-modal">

      {/* ── Header ── */}
      <ModalHeader
        className="tpl-header"
        contentClassName="tpl-header-left"
        kicker={creatorMode === 'create' ? 'Create Custom Round' : 'Edit For This Game'}
        title={creatorMode === 'create' ? 'Custom Buzz Round' : (newTemplateName || 'Untitled round')}
        titleTag="h3"
        titleClassName="tpl-title"
        right={(
          <div className="tpl-header-right">
            {isEditorDirty && <div className="game-config-template-dirty dirty">Unsaved changes</div>}
            <CloseIconButton onClick={() => onCloseCreator()} />
          </div>
        )}
      />

      {/* ── Body: 3 panels ── */}
      <div className="tpl-body">

          {/* Panel 1: Round settings */}
          <div className="tpl-panel-left">

            <div className="tpl-section">
              <div className="tpl-section-label">Details</div>
              <div className="game-config-template-field-stack">
                <label className="game-config-field-label">
                  Name
                  <input
                    className="team-name-input game-config-field"
                    type="text"
                    value={newTemplateName}
                    onChange={(e) => setNewTemplateName(e.target.value)}
                    maxLength={120}
                    placeholder="Round name"
                  />
                </label>
                <label className="game-config-field-label">
                  Intro
                  <textarea
                    className="team-name-input game-config-field game-config-template-textarea"
                    value={newTemplateIntro}
                    onChange={(e) => setNewTemplateIntro(e.target.value)}
                    maxLength={2000}
                    placeholder="Shown at round start (optional)"
                  />
                </label>
              </div>
            </div>

            <div className="tpl-section">
              <button type="button" className="tpl-section-toggle" onClick={() => setRulesOpen((v) => !v)}>
                <span>Rules</span>
                <span className="tpl-section-meta">
                  <span className="tpl-count">{newTemplateRules.length}</span>
                  <span className={`tpl-chevron${rulesOpen ? ' open' : ''}`}>›</span>
                </span>
              </button>
              {rulesOpen && (
                <div className="tpl-section-body">
                  {newTemplateRules.map((rule, idx) => (
                    <div key={`rule-${idx}`} className="game-config-template-row">
                      <input
                        className="team-name-input game-config-field"
                        type="text"
                        value={rule}
                        onChange={(e) => setNewTemplateRules((prev) => prev.map((item, i) => i === idx ? e.target.value : item))}
                        placeholder={`Rule ${idx + 1}`}
                      />
                      <IconRemoveButton
                        onClick={() => setNewTemplateRules((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))}
                        ariaLabel="Remove rule"
                      />
                    </div>
                  ))}
                  <button type="button" className="game-config-add-row-btn" onClick={() => setNewTemplateRules((prev) => [...prev, ''])}>
                    + Rule
                  </button>
                </div>
              )}
            </div>

            <div className="tpl-section">
              <button type="button" className="tpl-section-toggle" onClick={() => setScoringOpen((v) => !v)}>
                <span>Scoring</span>
                <span className="tpl-section-meta">
                  <span className="tpl-count">{newTemplateScoring.length}</span>
                  <span className={`tpl-chevron${scoringOpen ? ' open' : ''}`}>›</span>
                </span>
              </button>
              {scoringOpen && (
                <div className="tpl-section-body">
                  <div className="game-config-score-col-heads">
                    <span>Label</span>
                    <span>Pts</span>
                    <span>Phase</span>
                  </div>
                  {newTemplateScoring.map((row, idx) => {
                    const prevPhase = idx > 0 ? newTemplateScoring[idx - 1].phase : null
                    const isGroupBreak = row.phase === 'steal' && prevPhase === 'normal'
                    return (
                      <div
                        key={`score-${idx}`}
                        className={`game-config-template-row game-config-template-row-score${isGroupBreak ? ' score-group-break' : ''}`}
                      >
                        <input
                          className="team-name-input game-config-field"
                          type="text"
                          value={row.label}
                          onChange={(e) => setNewTemplateScoring((prev) => prev.map((item, i) => i === idx ? { ...item, label: e.target.value } : item))}
                          placeholder="e.g. Correct answer"
                        />
                        <PointsInput
                          value={row.points}
                          onChange={(val) => setNewTemplateScoring((prev) => prev.map((item, i) => i !== idx ? item : { ...item, points: val }))}
                        />
                        <select
                          className="team-name-input game-config-field game-config-select"
                          value={row.phase}
                          onChange={(e) => setNewTemplateScoring((prev) => {
                            const newPhase = e.target.value
                            const moved = { ...prev[idx], phase: newPhase }
                            const rest = prev.filter((_, i) => i !== idx)
                            const insertAt = rest.reduce((last, item, i) => item.phase === newPhase ? i + 1 : last, 0)
                            return [...rest.slice(0, insertAt), moved, ...rest.slice(insertAt)]
                          })}
                        >
                          <option value="normal">Normal</option>
                          <option value="steal">Steal</option>
                        </select>
                        <IconRemoveButton
                          onClick={() => setNewTemplateScoring((prev) => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))}
                          ariaLabel="Remove scoring row"
                        />
                      </div>
                    )
                  })}
                  <button
                    type="button"
                    className="game-config-add-row-btn"
                    onClick={() => setNewTemplateScoring((prev) => {
                      const next = [...prev, { label: '', points: 0, phase: 'normal' }]
                      return next.sort((a, b) => a.phase === b.phase ? 0 : a.phase === 'normal' ? -1 : 1)
                    })}
                  >
                    + Score Row
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Panel 2: Question list */}
          <div className="tpl-panel-mid">
            <div className="tpl-q-list-head">
              <span>Questions</span>
              <span className="tpl-count">{newTemplateQuestions.length}</span>
            </div>
            <div className="tpl-q-list">
              {newTemplateQuestions.map((q, idx) => (
                <button
                  key={q.id || `q-${idx}`}
                  type="button"
                  className={`tpl-q-item${safeIdx === idx ? ' active' : ''}`}
                  onClick={() => setSelectedQIdx(idx)}
                >
                  <span className="tpl-q-num">Q{idx + 1}</span>
                  <span className="tpl-q-preview">
                    {q.promptText?.trim() || <em>Empty prompt</em>}
                  </span>
                  {q.promptType !== 'text' && (
                    <span className="tpl-q-type">{q.promptType.toUpperCase()}</span>
                  )}
                </button>
              ))}
            </div>
            <button type="button" className="tpl-q-add-btn" onClick={addQuestion}>
              + New question
            </button>
          </div>

          {/* Panel 3: Editor + Preview */}
          <div className="tpl-panel-right">
            {selectedQ && (
              <div className="tpl-editor">
                <div className="tpl-editor-head">
                  <span className="tpl-editor-q-label">Q{safeIdx + 1}</span>
                  <div className="tpl-type-tabs">
                    {['text', 'image', 'video'].map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`tpl-type-tab${selectedQ.promptType === t ? ' active' : ''}`}
                        onClick={() => updateQuestion(safeIdx, { promptType: t })}
                      >
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </button>
                    ))}
                  </div>
                  {deleteConfirmIdx === safeIdx ? (
                    <div className="tpl-delete-confirm">
                      <span>Delete Q{safeIdx + 1}?</span>
                      <button type="button" className="tpl-delete-confirm-yes" onClick={() => { removeQuestion(safeIdx); setDeleteConfirmIdx(null) }}>Delete</button>
                      <button type="button" className="tpl-delete-confirm-no" onClick={() => setDeleteConfirmIdx(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="tpl-delete-q-btn"
                      onClick={() => setDeleteConfirmIdx(safeIdx)}
                      disabled={newTemplateQuestions.length <= 1}
                      aria-label="Delete question"
                    >Delete</button>
                  )}
                </div>

                <div className="tpl-editor-fields">
                  <label className="game-config-field-label">
                    Prompt text <span className="tpl-field-hint">what the host reads · what players see</span>
                    <textarea
                      className="team-name-input game-config-field tpl-prompt-textarea"
                      value={selectedQ.promptText}
                      onChange={(e) => updateQuestion(safeIdx, { promptText: e.target.value })}
                      placeholder="Type the question or prompt…"
                    />
                  </label>

                  {(selectedQ.promptType === 'image' || selectedQ.promptType === 'video') && (
                    <>
                      <label className="game-config-field-label">
                        {selectedQ.promptType === 'image' ? 'Image URL' : 'Video URL'}
                        <input
                          className="team-name-input game-config-field"
                          type="url"
                          value={selectedQ.mediaUrl}
                          onChange={(e) => updateQuestion(safeIdx, { mediaUrl: e.target.value })}
                          placeholder={selectedQ.promptType === 'image' ? 'https://… direct image link' : 'YouTube or direct video URL'}
                        />
                      </label>
                      {urlFeedback && (
                        <div className={`game-config-url-feedback status-${urlFeedback.kind}`}>{urlFeedback.message}</div>
                      )}
                      <MediaPreview
                        key={`${selectedQ.promptType}:${String(selectedQ.mediaUrl || '').trim()}`}
                        promptType={selectedQ.promptType}
                        mediaUrl={selectedQ.mediaUrl}
                      />
                    </>
                  )}

                  <label className="game-config-field-label">
                    Correct answer
                    <input
                      className="team-name-input game-config-field"
                      type="text"
                      value={selectedQ.answer}
                      onChange={(e) => updateQuestion(safeIdx, { answer: e.target.value })}
                      placeholder="The right answer…"
                    />
                  </label>

                  <label className="game-config-field-label">
                    Explanation <span className="tpl-field-hint">shown after reveal (optional)</span>
                    <textarea
                      className="team-name-input game-config-field game-config-template-textarea"
                      value={selectedQ.explanation}
                      onChange={(e) => updateQuestion(safeIdx, { explanation: e.target.value })}
                      placeholder="Extra context, a trivia tidbit, a source…"
                    />
                  </label>
                </div>

                <div className="tpl-editor-nav">
                  <button
                    type="button"
                    className="tpl-nav-btn"
                    onClick={() => setSelectedQIdx((i) => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                  >← prev</button>
                  <button
                    type="button"
                    className="tpl-nav-btn"
                    onClick={() => {
                      if (safeIdx < newTemplateQuestions.length - 1) setSelectedQIdx((i) => i + 1)
                      else addQuestion()
                    }}
                  >{safeIdx < newTemplateQuestions.length - 1 ? 'next →' : '+ add'}</button>
                </div>
              </div>
            )}

          </div>
      </div>

        {/* ── Footer ── */}
      {(createError || (!createError && inlineValidationError && isEditorDirty)) && (
        <div className="tpl-error-bar">
          {createError || `Fix before saving: ${inlineValidationError}`}
        </div>
      )}
      <div className="tpl-footer">
        <button type="button" className="game-config-template-cancel-btn" onClick={() => onCloseCreator()} disabled={createSubmitting}>
          Cancel
        </button>
        <button
          type="button"
          className="game-config-template-save-btn"
          onClick={() => { if (creatorMode === 'session-edit') onSaveSessionRoundEdits(); else void onCreateTemplate() }}
          disabled={!canSubmitCreator}
        >
          {creatorMode === 'session-edit' ? 'Save Changes' : (createSubmitting ? 'Creating…' : 'Create Round')}
        </button>
      </div>
    </ModalShell>
  )
}
