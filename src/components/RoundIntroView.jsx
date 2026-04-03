import { useState } from 'react'
import QRImg from './QRImg'
import MemberRoster from './MemberRoster'

export default function RoundIntroView({
  rounds, roundIndex, doneQuestions,
  teams, members, buzzerUrl,
  onNavigate, onBack,
}) {
  const round = rounds[roundIndex]
  const [qrOpen, setQrOpen] = useState(false)

  return (
    <div className="question-view">

      {/* Nav */}
      <div className="qv-nav">
        <button className="qv-back" onClick={onBack}>← Back</button>
        <div className="qv-heading">
          <span className="qv-round-tag">{round.label}</span>
          <span className="qv-round-name">{round.name}</span>
        </div>
        <div />
      </div>

      {/* Main: sidebar + content + right sidebar */}
      <div className="qv-main">

        {/* Left sidebar */}
        <Sidebar rounds={rounds} roundIndex={roundIndex} activeQIdx={null} doneQuestions={doneQuestions} onNavigate={onNavigate} />

        {/* Intro content */}
        <div className="qv-body">
          <div className="round-intro">
            <div className="round-intro-tag">{round.label}</div>
            <h2 className="round-intro-name">{round.name}</h2>
            <p className="round-intro-blurb">{round.intro}</p>

            <div className="round-intro-section">
              <div className="round-intro-section-label">Rules</div>
              <ul className="round-intro-rules">
                {round.rules.map((rule, i) => (
                  <li key={i}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="round-intro-section">
              <div className="round-intro-section-label">Scoring</div>
              <div className="round-intro-scoring">
                {round.scoring.map(({ label, points }) => (
                  <div key={label} className={`round-intro-score-row ${points < 0 ? 'neg' : points === 0 ? 'neutral' : 'pos'}`}>
                    <span className="round-intro-score-pts">{points > 0 ? `+${points}` : points === 0 ? '—' : points}</span>
                    <span className="round-intro-score-label">{label}</span>
                  </div>
                ))}
              </div>
              {round.type === 'video' && (
                <p className="round-intro-steal-note">
                  Steal is always for the <strong>language</strong> (+2 pts), regardless of what the buzzing team got wrong. Country (+1) is only for the team that buzzed in — no country steal.
                </p>
              )}
            </div>

            <button
              className="round-intro-start-btn"
              onClick={() => onNavigate(roundIndex, 0)}
            >
              Start Round →
            </button>
          </div>
        </div>

        {/* Right sidebar: QR code + team chips */}
        <div className={`qv-codes-sidebar${qrOpen ? '' : ' collapsed'}`}>
          <button className="qv-sidebar-toggle" onClick={() => setQrOpen(o => !o)}>
            {qrOpen ? '›' : '‹'}
          </button>
          {qrOpen && (
            <>
              <QRImg url={buzzerUrl} />
              <div className="qv-codes-url">{buzzerUrl}</div>
              {teams.map((t, i) => (
                <div key={i} className={`qv-codes-chip color-${t.color}`}>
                  <span className="qv-codes-chip-name">{t.name}</span>
                  <MemberRoster members={members?.[i] || []} compact maxVisible={3} />
                </div>
              ))}
            </>
          )}
        </div>

      </div>
    </div>
  )
}

function Sidebar({ rounds, roundIndex, activeQIdx, doneQuestions, onNavigate }) {
  return (
    <div className="qv-sidebar">
      {rounds.map((r, ri) => {
        const typeLabel = { video: 'Video', slang: 'Slang', charades: 'Charades', thesis: 'Thesis' }
        return (
          <div key={ri} className="qv-sidebar-group">
            <button
              className={`qv-sidebar-round-label clickable${ri === roundIndex && activeQIdx === null ? ' active-round' : ''}`}
              onClick={() => onNavigate(ri, null)}
            >
              {r.label}
            </button>
            {r.questions.map((_q, qi) => {
              const done = doneQuestions?.has(`${ri}-${qi}`)
              const active = ri === roundIndex && qi === activeQIdx
              return (
                <button
                  key={qi}
                  className={`qv-sidebar-item${active ? ' active' : ''}${done ? ' done' : ''}`}
                  onClick={() => onNavigate(ri, qi)}
                >
                  {done ? '✓ ' : ''}{typeLabel[r.type]} {qi + 1}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
