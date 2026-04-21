import ModalShell from '../ui/ModalShell'
import ModalHeader from '../ui/ModalHeader'

export default function BrowseTemplatesModal({
  items = [],
  search = '',
  setSearch = () => {},
  onPreview = () => {},
  onAdd = () => {},
  onRemove = () => {},
  onClose = () => {},
}) {
  return (
    <ModalShell onClose={onClose} dialogClassName="gclib-modal">
      <ModalHeader
        className="gclib-header"
        kicker="Template Library"
        kickerClassName="gclib-kicker"
        title="Browse Community Rounds"
        titleClassName="gclib-title"
        subtitle="Pick rounds to add to this game’s run of show."
        subtitleClassName="gclib-sub"
        onClose={onClose}
      />

      <div className="gclib-toolbar">
        <input
          type="text"
          className="gclib-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, intro, or question content"
        />
        {search.trim() && (
          <button type="button" className="gclib-clear" onClick={() => setSearch('')}>
            Clear
          </button>
        )}
      </div>

      <div className="gclib-list">
        {items.length === 0 && (
          <div className="gclib-empty">No matching community rounds.</div>
        )}
        {items.map((item) => (
          <div key={item.round.id} className="gclib-card">
            <div className="gclib-card-head">
              <div>
                <div className="gclib-card-name">{item.round.name}</div>
                <div className="gclib-card-meta">
                  {item.round.questions.length} question{item.round.questions.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="gclib-card-actions">
                <button
                  type="button"
                  className="gclib-btn gclib-btn-preview"
                  onClick={() => onPreview(item.round.id)}
                >
                  Preview
                </button>
                {item.added ? (
                  <button
                    type="button"
                    className="gclib-btn gclib-btn-remove"
                    onClick={() => onRemove(item.round.id)}
                  >
                    Remove
                  </button>
                ) : (
                  <button
                    type="button"
                    className="gclib-btn gclib-btn-add"
                    onClick={() => onAdd(item.round.id)}
                  >
                    Add to Run of Show
                  </button>
                )}
              </div>
            </div>
            {item.round.intro && (
              <p className="gclib-card-intro">{item.round.intro}</p>
            )}
          </div>
        ))}
      </div>

      <div className="gclib-footer">
        <button type="button" className="gclib-done" onClick={onClose}>Done</button>
      </div>
    </ModalShell>
  )
}
