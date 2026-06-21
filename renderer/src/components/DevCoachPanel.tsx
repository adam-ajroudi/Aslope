import type { DevCoachEntry } from '@shared/devCoaching'
import type { SeerState } from '@shared/types'
import './DevCoachPanel.css'

type DevCoachPanelProps = {
  entries: DevCoachEntry[]
  seerState: SeerState | null
  onStressTest: () => Promise<void>
  stressTesting: boolean
}

export function DevCoachPanel({
  entries,
  seerState,
  onStressTest,
  stressTesting
}: DevCoachPanelProps): React.ReactElement {
  const recent = entries.slice(0, 4)

  return (
    <section className="dev-coach-panel">
      <div className="dev-coach-header">
        <h2>Seer</h2>
        <button
          type="button"
          className="dev-coach-stress"
          onClick={() => void onStressTest()}
          disabled={stressTesting}
        >
          {stressTesting ? 'Provoking Seer…' : 'Stress test'}
        </button>
      </div>

      {seerState && (
        <p className="dev-coach-vibe">
          Friendship: <strong>{seerState.vibeLabel}</strong>
          {seerState.relationship.interactionCount > 0 && (
            <span> · {seerState.relationship.interactionCount} banters</span>
          )}
        </p>
      )}

      <p className="dev-coach-hint">
        Seer watches your app in the background. When Sentry fires, you banter back — the vibe evolves.
      </p>

      {recent.length > 0 ? (
        <ul className="dev-coach-list">
          {recent.map((entry) => (
            <li key={entry.id} className="dev-coach-entry">
              <span className="dev-coach-meta">
                {entry.vibeLabel} · {entry.component}
              </span>
              <p className="dev-coach-seer">
                <span className="dev-coach-who">Seer:</span> {entry.plea}
              </p>
              <p className="dev-coach-you">
                <span className="dev-coach-who">You:</span> &ldquo;{entry.coachMessage}&rdquo;
              </p>
              <p className="dev-coach-reply">
                <span className="dev-coach-who">Seer:</span> {entry.seerComeback}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dev-coach-empty">No banter yet — stress test to meet Seer.</p>
      )}
    </section>
  )
}
