import { createClient, type RedisClientOptions, type RedisClientType } from 'redis'

let client: RedisClientType | null = null
let connectPromise: Promise<RedisClientType | null> | null = null
let connectionFailed = false
let retryCount = 0
let keepAliveTimer: ReturnType<typeof setInterval> | null = null

const MAX_RETRIES = 3
const RETRY_DELAY_MS = 2000
const KEEPALIVE_MS = 10_000

function invalidateClient(): void {
  client = null
  connectPromise = null
}

function markFailed(): void {
  connectionFailed = true
  invalidateClient()
}

function attachErrorHandler(next: RedisClientType): void {
  next.on('error', (err) => {
    console.error('[redis] client error — using memory fallback.', err.message)
    invalidateClient()
  })
}

function reconnectStrategy(retriesElapsed: number): number | Error {
  if (retriesElapsed >= MAX_RETRIES) {
    return new Error('[redis] max reconnect attempts reached')
  }
  return Math.min(retriesElapsed * RETRY_DELAY_MS, 5000)
}

function buildClientOptions(): RedisClientOptions | null {
  const rawUrl = process.env.REDIS_URL?.trim()
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl)
      if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
        console.warn('[redis] REDIS_URL must use redis:// or rediss://')
        return null
      }
      parsed.hostname = parsed.hostname.toLowerCase()
      return {
        url: parsed.toString(),
        socket: { reconnectStrategy }
      }
    } catch {
      console.warn('[redis] REDIS_URL is not a valid URL')
      return null
    }
  }

  const host = process.env.REDIS_HOST?.trim()
  const port = Number(process.env.REDIS_PORT)
  if (!host || !Number.isFinite(port)) {
    return null
  }

  return {
    username: process.env.REDIS_USERNAME?.trim() || 'default',
    password: process.env.REDIS_PASSWORD?.trim(),
    socket: {
      host,
      port,
      reconnectStrategy
    }
  }
}

export async function getRedis(): Promise<RedisClientType | null> {
  const options = buildClientOptions()
  if (!options) {
    return null
  }

  if (connectionFailed) {
    if (retryCount < MAX_RETRIES) {
      retryCount++
      connectionFailed = false
      console.log(`[redis] retry attempt ${retryCount}/${MAX_RETRIES}`)
    } else {
      return null
    }
  }

  if (client?.isOpen) {
    retryCount = 0
    return client
  }

  if (!connectPromise) {
    connectPromise = (async () => {
      const next = createClient(options)
      attachErrorHandler(next)

      try {
        await next.connect()
        console.log('[redis] connected')
        client = next
        retryCount = 0
        startKeepAlive()
        return next
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          '[redis] connect failed — using memory fallback.',
          message,
          '\n  Check REDIS_URL or REDIS_HOST/REDIS_PORT in .env.'
        )
        markFailed()

        try {
          if (next.isOpen) {
            await next.destroy()
          }
        } catch {
          // ignore cleanup errors
        }

        return null
      }
    })()
  }

  return connectPromise
}

function startKeepAlive(): void {
  stopKeepAlive()
  keepAliveTimer = setInterval(() => {
    if (client?.isOpen) {
      client.ping().catch(() => {
        invalidateClient()
      })
    } else {
      stopKeepAlive()
    }
  }, KEEPALIVE_MS)
}

function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

export async function disconnectRedis(): Promise<void> {
  stopKeepAlive()
  if (client?.isOpen) {
    await client.quit()
  }
  client = null
  connectPromise = null
  connectionFailed = false
  retryCount = 0
}

export async function isRedisReady(): Promise<boolean> {
  const redis = await getRedis()
  if (!redis) return false

  try {
    await redis.ping()
    return true
  } catch {
    invalidateClient()
    return false
  }
}
