export default function MemberRoster({ members = [], compact = false, maxVisible = 6 }) {
  const cleanedMembers = members
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean)
  const visibleMembers = cleanedMembers.slice(0, maxVisible)
  const hiddenCount = cleanedMembers.length - visibleMembers.length

  return (
    <div className={`member-roster${compact ? ' compact' : ''}`}>
      <div className="member-roster-head">
        <span className="member-roster-label">Members</span>
        <span className="member-roster-count">{cleanedMembers.length}</span>
      </div>

      {cleanedMembers.length === 0 ? (
        <div className="member-roster-empty">No one joined yet</div>
      ) : (
        <div className="member-roster-list">
          {visibleMembers.map((name, idx) => (
            <span key={`${name}-${idx}`} className="member-roster-pill" title={name}>
              {name}
            </span>
          ))}
          {hiddenCount > 0 && <span className="member-roster-more">+{hiddenCount} more</span>}
        </div>
      )}
    </div>
  )
}
