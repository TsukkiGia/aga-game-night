import { useEffect, useRef, useState } from 'react'
import { questionPreviewMedia } from './helpers'
import { toYouTubeEmbedUrl } from '../../utils/mediaPrompt'
import CloseIconButton from '../CloseIconButton'
import ModalShell from '../ModalShell'

const PREVIEW_PAGE_SIZE = 8
const PREVIEW_MEDIA_OBSERVER_MARGIN = '220px'
const PREVIEW_PAGING_OBSERVER_MARGIN = '140px'
const PREVIEW_PAGE_LOAD_DELAY_MS = 180

function getPreviewMedia(round, question) {
  const media = questionPreviewMedia(round, question)
  if (!media) return null
  if (media.type === 'image') return { type: 'image', src: media.rawUrl }
  const embedUrl = toYouTubeEmbedUrl(media.rawUrl)
  if (embedUrl) return { type: 'video-embed', src: embedUrl }
  return { type: 'video-file', src: media.rawUrl }
}

function LazyPreviewMedia({ previewMedia, questionIndex }) {
  const mountRef = useRef(null)
  const supportsObserver = typeof IntersectionObserver !== 'undefined'
  const [shouldRenderMedia, setShouldRenderMedia] = useState(() => !supportsObserver)

  useEffect(() => {
    if (!previewMedia) return undefined
    if (shouldRenderMedia) return undefined
    const node = mountRef.current
    if (!node) return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.some((entry) => entry.isIntersecting)
        if (!visible) return
        setShouldRenderMedia(true)
        observer.disconnect()
      },
      { root: null, rootMargin: PREVIEW_MEDIA_OBSERVER_MARGIN }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [previewMedia, shouldRenderMedia])

  if (!previewMedia) return null

  return (
    <div ref={mountRef} className="gcpv-media-box">
      {!shouldRenderMedia ? (
        <div className="gcpv-media-placeholder">Media preview loads on scroll</div>
      ) : previewMedia.type === 'image' ? (
        <img
          className="gcpv-media-image"
          src={previewMedia.src}
          alt={`Question ${questionIndex + 1} prompt`}
          referrerPolicy="no-referrer"
          loading="lazy"
        />
      ) : previewMedia.type === 'video-embed' ? (
        <iframe
          className="gcpv-media-video"
          src={previewMedia.src}
          title={`Question ${questionIndex + 1} video`}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          loading="lazy"
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
  )
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
  const paginationKey = `${round.id}|${mode}|${previewSearchNormalized}`
  const [paginationState, setPaginationState] = useState(() => ({ key: paginationKey, page: 1 }))
  const previewPage = paginationState.key === paginationKey ? paginationState.page : 1
  const loadMoreRef = useRef(null)
  const loadTimerRef = useRef(null)
  const [autoPagingState, setAutoPagingState] = useState(() => ({ key: paginationKey, value: false }))
  const isAutoPaging = autoPagingState.key === paginationKey ? autoPagingState.value : false
  const visibleCount = previewPage * PREVIEW_PAGE_SIZE
  const visibleItems = previewItems.slice(0, visibleCount)
  const remainingCount = Math.max(0, previewItems.length - visibleItems.length)
  const nextBatchCount = Math.min(PREVIEW_PAGE_SIZE, remainingCount)

  useEffect(() => {
    return () => {
      if (loadTimerRef.current) {
        window.clearTimeout(loadTimerRef.current)
        loadTimerRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (remainingCount <= 0) return undefined
    const node = loadMoreRef.current
    if (!node) return undefined
    if (typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(
      (entries) => {
        const shouldLoad = entries.some((entry) => entry.isIntersecting)
        if (!shouldLoad || loadTimerRef.current) return
        setAutoPagingState({ key: paginationKey, value: true })
        loadTimerRef.current = window.setTimeout(() => {
          setPaginationState((prev) => {
            const currentPage = prev.key === paginationKey ? prev.page : 1
            return { key: paginationKey, page: currentPage + 1 }
          })
          loadTimerRef.current = null
          setAutoPagingState({ key: paginationKey, value: false })
        }, PREVIEW_PAGE_LOAD_DELAY_MS)
      },
      { root: null, rootMargin: PREVIEW_PAGING_OBSERVER_MARGIN }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [remainingCount, paginationKey, visibleItems.length])

  return (
    <ModalShell onClose={onClose} dialogClassName="gcpv-modal">

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
        {visibleItems.map(({ key, question, questionId, questionIndex, selected, headline, detail, tags, answer }) => {
          const previewMedia = getPreviewMedia(round, question)
          const fullPromptText = String(question?.promptText || '').trim()
          const shouldUseFullPrompt = round.type === 'custom-buzz' && Boolean(fullPromptText)
          const displayHeadline = shouldUseFullPrompt ? fullPromptText : headline
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

              <div className={`gcpv-q-title${shouldUseFullPrompt ? ' full-prompt' : ''}`}>{displayHeadline}</div>
              {detail && <div className="gcpv-q-detail">{detail}</div>}

              <LazyPreviewMedia
                key={`${String(previewMedia?.type || 'none')}|${String(previewMedia?.src || '')}`}
                previewMedia={previewMedia}
                questionIndex={questionIndex}
              />

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
          )
        })}
        {remainingCount > 0 && (
          <div ref={loadMoreRef} className="gcpv-infinite-loader" aria-live="polite">
            <span className={`gcpv-infinite-spinner${isAutoPaging ? ' spinning' : ''}`} aria-hidden="true" />
            <span className="gcpv-infinite-label">
              {isAutoPaging
                ? `Loading ${nextBatchCount} more…`
                : `${remainingCount} more question${remainingCount === 1 ? '' : 's'} will load as you scroll`}
            </span>
          </div>
        )}
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
    </ModalShell>
  )
}
