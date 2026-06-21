import { createClient, type RedisClientType } from 'redis'

let client: RedisClientType | null = null
let connectPromise: Promise<RedisClientType | null> | null = null
let connectionFailed = false

function normalizeRedisUrl(raw: string): string | null {
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'redis:' && parsed.protocol !== 'rediss:') {
      console.warn('[redis] REDIS_URL must use redis:// or rediss://')
      return null
    }
    parsed.hostname = parsed.hostname.toLowerCase()
    return parsed.toString()
  } catch {
    console.warn('[redis] REDIS_URL is not a valid URL')
    return null
  }
}

export async function getRedis(): Promise<RedisClientType | null> {
  const rawUrl = process.env.REDIS_URL?.trim()
  if (!rawUrl) {
    return null
  }

  if (connectionFailed) {
    return null
  }

  if (client?.isOpen) {
    return client
  }

  const url = normalizeRedisUrl(rawUrl)
  if (!url) {
    connectionFailed = true
    return null
  }

  if (!connectPromise) {
    connectPromise = (async () => {
      const next = createClient({
        url,
        socket: {
          reconnectStrategy: () => false
        }
      })

      try {
        await next.connect()
        console.log('[redis] connected')
        client = next
        return next
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        console.error(
          '[redis] connect failed — using memory fallback.',
          message,
          '\n  Check REDIS_URL in .env (Redis To Go dashboard → rediss:// or redis:// URL).'
        )
        connectionFailed = true
        connectPromise = null

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

export async function disconnectRedis(): Promise<void> {
  if (client?.isOpen) {
    await client.quit()
  }
  client = null
  connectPromise = null
  connectionFailed = false
}

export async function isRedisReady(): Promise<boolean> {
  const redis = await getRedis()
  if (!redis) return false

  try {
    await redis.ping()
    return true
  } catch {
    connectionFailed = true
    client = null
    connectPromise = null
    return false
  }
}
