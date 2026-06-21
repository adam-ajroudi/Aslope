import type { AgentMemory, PostSessionResult } from '@shared/agentMemory'
import './SessionDashboard.css'

type SessionDashboardProps = {
  postSession: PostSessionResult | null
  memory: AgentMemory | null
  ending: boolean
}

function formatDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.floor((ms % 60_000) / 1000)
  if (minutes === 0) return `${seconds}s`
  return `${minutes}m ${seconds}s`
}

export function SessionDashboard({
  postSession,
  memory,
  ending
}: SessionDashboardProps): React.ReactElement {
  if (ending) {
    return (
      <section className="session-dashboard">
        <h2>Log of Wins</h2>
        <p className="dashboard-loading">Claude is reviewing your session…</p>
      </section>
    )
  }

  if (!postSession && !memory) {
    return (
      <section className="session-dashboard">
        <h2>Log of Wins</h2>
        <p className="dashboard-empty">End a session to see your coach note and wins.</p>
      </section>
    )
  }

  const allWins = memory?.wins ?? postSession?.wins ?? []
  const recentWins = allWins.slice(-5).reverse()

  return (
    <section className="session-dashboard">
      <h2>Log of Wins</h2>

      {memory && memory.totalSessions > 0 && (
        <div className="dashboard-stats">
          <div className="dashboard-stat">
            <span className="dashboard-stat-value">{memory.focusScoreAvg.toFixed(0)}</span>
            <span className="dashboard-stat-label">Avg focus</span>
          </div>
          <div className="dashboard-stat">
            <span className="dashboard-stat-value">{memory.totalSessions}</span>
            <span className="dashboard-stat-label">Sessions</span>
          </div>
          <div className="dashboard-stat">
            <span className="dashboard-stat-value">{memory.totalTriggers}</span>
            <span className="dashboard-stat-label">Nudges</span>
          </div>
        </div>
      )}

      {postSession && (
        <div className="dashboard-latest">
          <div className="dashboard-score">
            <span className="dashboard-score-value">{postSession.focusScore}</span>
            <span className="dashboard-score-label">Focus score</span>
          </div>

          <p className="dashboard-coach-note">{postSession.coachNote}</p>

          <dl className="dashboard-summary">
            <dt>Duration</dt>
            <dd>{formatDuration(postSession.summary.durationMs)}</dd>
            <dt>Slouch</dt>
            <dd>{postSession.summary.slouchCount}</dd>
            <dt>Phone</dt>
            <dd>{postSession.summary.phoneCount}</dd>
            <dt>Next task</dt>
            <dd>{postSession.nextTaskSuggestion}</dd>
          </dl>
        </div>
      )}

      {recentWins.length > 0 ? (
        <ul className="dashboard-wins">
          {recentWins.map((win) => (
            <li key={win.id} className="dashboard-win">
              <strong>{win.title}</strong>
              <p>{win.detail}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashboard-empty">No wins logged yet — trigger a nudge and bounce back.</p>
      )}
    </section>
  )
}
