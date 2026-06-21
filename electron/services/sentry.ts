import * as Sentry from '@sentry/electron/main'
import { triggerReverseNudge } from './reverseNudge'

export function initSentryMain(): void {
  const dsn = process.env.SENTRY_DSN

  Sentry.init({
    dsn: dsn || undefined,
    environment: process.env.NODE_ENV ?? 'development',
    enabled: Boolean(dsn),
    beforeSend(event) {
      if (event.level === 'info' || event.level === 'debug') {
        return event
      }

      const errorMessage = extractErrorMessage(event)
      const component =
        (typeof event.tags?.component === 'string' && event.tags.component) ||
        event.transaction ||
        'sentry'

      if (errorMessage) {
        setImmediate(() => {
          void triggerReverseNudge('local-user', errorMessage, component)
        })
      }

      return event
    }
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

function extractErrorMessage(event: Sentry.Event): string | null {
  const exception = event.exception?.values?.[0]
  if (exception?.value) {
    return exception.type ? `${exception.type}: ${exception.value}` : exception.value
  }

  if (event.message) {
    return typeof event.message === 'string' ? event.message : String(event.message)
  }

  return null
}

export { Sentry }
