import * as Sentry from '@sentry/electron/main'

export function initSentryMain(): void {
  const dsn = process.env.SENTRY_DSN

  Sentry.init({
    dsn: dsn || undefined,
    environment: process.env.NODE_ENV ?? 'development',
    enabled: Boolean(dsn)
  })

  Sentry.addBreadcrumb({
    category: 'app',
    message: 'Anchor Vision main process started',
    level: 'info'
  })

  if (dsn) {
    Sentry.captureMessage('Anchor Vision M0 startup (main)', 'info')
  }
}

export { Sentry }
