import { questionPreviewMedia } from './helpers'
import { toYouTubeEmbedUrl } from '../../utils/mediaPrompt'
import CloseIconButton from '../CloseIconButton'

function getPreviewMedia(round, question) {
  const media = questionPreviewMedia(round, question)
  if (!media) return null
  if (media.type === 'image') return { type: 'image', src: media.rawUrl }
  const embedUrl = toYouTubeEmbedUrl(media.rawUrl)
  if (embedUrl) return { type: 'video-embed', src: embedUrl }
  return { type: 'video-file', src: media.rawUrl }
}

export default function PreviewModal({
  previewRow,
  saveSuccess = { roundId: '', text: '' },
  previewSearch,
  setPreviewSearch,
  previewSearchNormalized,
  previewMatchesLabel,
  previewItems,
  onClose,
  onToggleRound = () => {},
  onToggleQuestion = () => {},
  mode = 'selection',
  isRoundAdded = false,
  onAddRound = () => {},
  onRemoveRound = () => {},
}) {
  const isCommunityMode = mode === 'community'
  const { round, displayIndex, selectedCount, questionIds, allSelected } = previewRow
  const total = questionIds.length

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="gcpv-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="gcpv-header">
          <div className="gcpv-header-top">
            <span className={`gcpv-round-pill type-${round.type}`}>
              {isCommunityMode ? `Community Round · ${round.name}` : `Round ${displayIndex} · ${round.name}`}
            </span>
            <div className="gcpv-header-right">
              <span className="gcpv-selected-count">
                {isCommunityMode
                  ? `${total} question${total === 1 ? '' : 's'}`
                  : `${selectedCount} / ${total} selected`}
              </span>
              <CloseIconButton onClick={onClose} />
            </div>
          </div>

          <h2 className="gcpv-title">{round.name}</h2>
          {round.intro && <p className="gcpv-intro">{round.intro}</p>}
          {!isCommunityMode && saveSuccess.roundId === round.id && (
            <div className="gcpv-success">{saveSuccess.text}</div>
          )}

          <div className="gcpv-search-row">
            <input
              type="text"
              className="gcpv-search"
              value={previewSearch}
              onChange={(e) => setPreviewSearch(e.target.value)}
              placeholder="Search by question, answer, clue, or tag"
            />
            {previewSearchNormalized && (
              <button type="button" className="gcpv-search-clear" onClick={() => setPreviewSearch('')}>Clear</button>
            )}
            {previewMatchesLabel && (
              <span className="gcpv-search-count">{previewMatchesLabel}</span>
            )}
          </div>
        </div>

        {/* ── Question list ── */}
        <div className="gcpv-list">
          {previewItems.length === 0 && previewSearchNormalized && (
            <div className="gcpv-empty">No matches for "{previewSearch.trim()}".</div>
          )}
          {previewItems.map(({ key, question, questionId, questionIndex, selected, headline, detail, tags, answer }) => {
            const previewMedia = getPreviewMedia(round, question)
            return (
            <div key={key} className={`gcpv-question${!isCommunityMode && selected ? ' selected' : ''}`}>
              <div className="gcpv-q-head">
                <span className="gcpv-q-num">Q{questionIndex + 1}</span>
                {!isCommunityMode && (
                  <button
                    type="button"
                    className={`gcpv-q-check${selected ? ' selected' : ''}`}
                    aria-pressed={selected}
                    onClick={() => { if (questionId) onToggleQuestion(questionId) }}
                  >
                    {selected ? '✓' : ''}
                  </button>
                )}
              </div>

              <div className="gcpv-q-title">{headline}</div>
              {detail && <div className="gcpv-q-detail">{detail}</div>}

              {previewMedia && (
                <div className="gcpv-media-box">
                  {previewMedia.type === 'image' ? (
                    <img
                      className="gcpv-media-image"
                      src={previewMedia.src}
                      alt={`Question ${questionIndex + 1} prompt`}
                      referrerPolicy="no-referrer"
                    />
                  ) : previewMedia.type === 'video-embed' ? (
                    <iframe
                      className="gcpv-media-video"
                      src={previewMedia.src}
                      title={`Question ${questionIndex + 1} video`}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      className="gcpv-media-video"
                      src={previewMedia.src}
                      controls
                      preload="metadata"
                      muted
                      playsInline
                    />
                  )}
                </div>
              )}

              {answer && round.type !== 'charades' && round.type !== 'thesis' && (
                <div className="gcpv-answer">
                  <span className="gcpv-answer-label">Answer</span>
                  <strong>{answer}</strong>
                </div>
              )}

              {tags.length > 0 && (
                <div className="gcpv-tags">
                  {tags.map((tag, i) => <span key={i} className="gcpv-tag">{tag}</span>)}
                </div>
              )}
            </div>
          )})}
        </div>

        {/* ── Footer ── */}
        <div className="gcpv-footer">
          <span className="gcpv-footer-count">
            {isCommunityMode
              ? `${total} question${total === 1 ? '' : 's'}`
              : `${selectedCount} selected`}
          </span>
          <div className="gcpv-footer-actions">
            <button type="button" className="gcpv-footer-close" onClick={onClose}>Close</button>
            {isCommunityMode ? (
              <button
                type="button"
                className="gcpv-footer-select"
                onClick={isRoundAdded ? onRemoveRound : onAddRound}
              >
                {isRoundAdded ? 'Remove from Run of Show' : 'Add to Run of Show'}
              </button>
            ) : (
              <button
                type="button"
                className="gcpv-footer-select"
                onClick={() => onToggleRound(previewRow)}
              >
                {allSelected ? 'Clear all' : 'Select all'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
