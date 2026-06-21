import { useEffect, useState } from 'react'
import { WebcamFeed } from './components/WebcamFeed'
import type { Profile } from '@shared/types'

export default function App(): React.ReactElement {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [ipcReady, setIpcReady] = useState(false)

  useEffect(() => {
    if (!window.anchor) {
      console.warn('Anchor IPC bridge not available (running outside Electron?)')
      return
    }

    setIpcReady(true)

    window.anchor
      .getProfile()
      .then(setProfile)
      .catch((err: unknown) => {
        console.error('Failed to load profile:', err)
      })
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>Anchor Vision</h1>
        <p className="app-subtitle">Camera-driven focus coach</p>
      </header>

      <main className="app-main">
        <WebcamFeed />

        <aside className="app-sidebar">
          <div className="info-card">
            <h2>Status</h2>
            <dl>
              <dt>Milestone</dt>
              <dd>M0 — skeleton</dd>
              <dt>IPC bridge</dt>
              <dd>{ipcReady ? 'Connected' : 'Unavailable'}</dd>
              <dt>Profile</dt>
              <dd>{profile ? profile.userId : 'Loading…'}</dd>
            </dl>
          </div>
        </aside>
      </main>
    </div>
  )
}
