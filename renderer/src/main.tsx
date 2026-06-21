/// <reference types="vite/client" />

import './index.css'
import './App.css'

import * as Sentry from '@sentry/electron/renderer'
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

Sentry.init({
  integrations: [Sentry.replayIntegration()],
  replaysSessionSampleRate: import.meta.env.DEV ? 1.0 : 0.1,
  replaysOnErrorSampleRate: 1.0
})

Sentry.addBreadcrumb({
  category: 'app',
  message: 'Anchor Vision renderer started',
  level: 'info'
})

Sentry.captureMessage('Anchor Vision M0 startup (renderer)', 'info')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
