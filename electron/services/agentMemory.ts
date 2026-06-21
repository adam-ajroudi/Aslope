import { redisKeys } from '@shared/schema'
import {
  emptyAgentMemory,
  type AgentMemory,
  type MemorySnippet
} from '@shared/agentMemory'
import { getRedis } from './redis'

const memoryByUser = new Map<string, AgentMemory>()
const snippetsByUser = new Map<string, MemorySnippet[]>()

const MAX_WINS = 30
const MAX_SNIPPETS = 50
const MAX_INSIGHTS = 12

export function getMemoryFromCache(userId: string): AgentMemory {
  return memoryByUser.get(userId) ?? emptyAgentMemory(userId)
}

export async function loadAgentMemory(userId: string): Promise<AgentMemory> {
  const cached = memoryByUser.get(userId)
  if (cached) return cached

  const redis = await getRedis()
  if (!redis) {
    const empty = emptyAgentMemory(userId)
    memoryByUser.set(userId, empty)
    return empty
  }

  try {
    const raw = await redis.get(redisKeys.memory(userId))
    if (!raw) {
      const empty = emptyAgentMemory(userId)
      memoryByUser.set(userId, empty)
      return empty
    }

    const memory = JSON.parse(raw) as AgentMemory
    memoryByUser.set(userId, memory)
    return memory
  } catch (err) {
    console.error('[memory:load] failed:', err)
    const empty = emptyAgentMemory(userId)
    memoryByUser.set(userId, empty)
    return empty
  }
}

export async function saveAgentMemory(userId: string, memory: AgentMemory): Promise<void> {
  const trimmed: AgentMemory = {
    ...memory,
    wins: memory.wins.slice(-MAX_WINS),
    coachInsights: memory.coachInsights.slice(-MAX_INSIGHTS),
    updatedAt: Date.now()
  }

  memoryByUser.set(userId, trimmed)

  const redis = await getRedis()
  if (!redis) return

  try {
    await redis.set(redisKeys.memory(userId), JSON.stringify(trimmed))
  } catch (err) {
    console.error('[memory:save] failed:', err)
  }
}

export async function loadMemorySnippets(userId: string): Promise<MemorySnippet[]> {
  const cached = snippetsByUser.get(userId)
  if (cached) return cached

  const redis = await getRedis()
  if (!redis) return []

  try {
    const entries = await redis.lRange(redisKeys.memvec(userId), 0, MAX_SNIPPETS - 1)
    const snippets = entries
      .map((entry) => {
        try {
          return JSON.parse(entry) as MemorySnippet
        } catch {
          return null
        }
      })
      .filter((entry): entry is MemorySnippet => entry !== null)

    snippetsByUser.set(userId, snippets)
    return snippets
  } catch (err) {
    console.error('[memvec:load] failed:', err)
    return []
  }
}

export async function appendMemorySnippets(
  userId: string,
  snippets: MemorySnippet[]
): Promise<void> {
  if (snippets.length === 0) return

  const existing = snippetsByUser.get(userId) ?? (await loadMemorySnippets(userId))
  const merged = [...snippets, ...existing].slice(0, MAX_SNIPPETS)
  snippetsByUser.set(userId, merged)

  const redis = await getRedis()
  if (!redis) return

  try {
    const key = redisKeys.memvec(userId)
    for (const snippet of snippets) {
      await redis.lPush(key, JSON.stringify(snippet))
    }
    await redis.lTrim(key, 0, MAX_SNIPPETS - 1)
  } catch (err) {
    console.error('[memvec:append] failed:', err)
  }
}

export async function getMemoryContextForPrep(userId: string): Promise<string> {
  const memory = await loadAgentMemory(userId)
  const snippets = await loadMemorySnippets(userId)

  if (memory.totalSessions === 0 && snippets.length === 0) {
    return 'No prior sessions yet — this is a first-time user.'
  }

  const parts: string[] = [
    `Sessions completed: ${memory.totalSessions}`,
    `Lifetime triggers: ${memory.totalTriggers} (slouch ${memory.slouchTriggers}, phone ${memory.phoneTriggers})`,
    `Average focus score: ${memory.focusScoreAvg.toFixed(0)}/100`
  ]

  if (memory.lastCoachNote) {
    parts.push(`Last coach note: ${memory.lastCoachNote}`)
  }

  if (memory.coachInsights.length > 0) {
    parts.push(`Coach insights: ${memory.coachInsights.slice(-5).join(' | ')}`)
  }

  if (memory.wins.length > 0) {
    const recentWins = memory.wins
      .slice(-3)
      .map((win) => `${win.title}: ${win.detail}`)
      .join('\n')
    parts.push(`Recent wins:\n${recentWins}`)
  }

  if (snippets.length > 0) {
    const recall = snippets
      .slice(0, 5)
      .map((snippet) => `- ${snippet.text}`)
      .join('\n')
    parts.push(`Semantic memory recall:\n${recall}`)
  }

  return parts.join('\n\n')
}
