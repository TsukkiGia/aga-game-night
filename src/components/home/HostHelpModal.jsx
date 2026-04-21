import ModalShell from '../ui/ModalShell'
import ModalHeader from '../ui/ModalHeader'

export default function HostHelpModal({ open, onClose, hostCompanionUrl }) {
  if (!open) return null

  return (
    <ModalShell onClose={onClose} dialogClassName="help-popup">
      <ModalHeader
        kicker="Host Guide"
        title="How To Run The Game"
        onClose={onClose}
      />

      <div className="help-sections">
        <section className="help-section">
          <h3>Host Companion</h3>
          <p>Open Host Companion on a phone/tablet to control timer and sound effects remotely.</p>
          <a className="help-link" href={hostCompanionUrl} target="_blank" rel="noreferrer">
            Open Host Companion
          </a>
          <p>Use the same session code and host PIN when prompted.</p>
        </section>

        <section className="help-section">
          <h3>Buzzing Flow</h3>
          <ul>
            <li>Press <strong>Arm Buzzers</strong> before answers.</li>
            <li>First buzz locks everyone else out.</li>
            <li>Press <strong>Reset Buzzers</strong> after scoring to reopen buzzing.</li>
            <li>For steals, use <strong>Open Steal</strong> on question screens.</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Player Join</h3>
          <ul>
            <li>Players scan the QR code or open the join link.</li>
            <li>They choose a team and enter their name.</li>
            <li>The member list on each team card updates live.</li>
          </ul>
        </section>

        <section className="help-section">
          <h3>Quick Troubleshooting</h3>
          <ul>
            <li>If buzzing seems stuck, press <strong>Reset Buzzers</strong>.</li>
            <li>If sound effects do not play, click anywhere once to unlock audio.</li>
            <li>If state looks stale, reload the page and re-enter session code + PIN.</li>
          </ul>
        </section>
      </div>
    </ModalShell>
  )
}
