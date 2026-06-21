import type {
  AgentMemory,
  MemorySnippet,
  PostSessionResult,
  SessionEventRecord,
  SessionRecord,
  WinEntry
} from '@shared/agentMemory'
import {
  POST_SESSION_JSON_SCHEMA,
  parsePostSessionJson,
  toWinEntries
} from '@shared/postSessionSchema'
import type { Profile } from '@shared/types'
import { v4 as uuidv4 } from 'uuid'
import { getAnthropicClient, getPrepModel } from '../services/anthropic'
import {
  appendMemorySnippets,
  loadAgentMemory,
  saveAgentMemory
} from '../services/agentMemory'
import { buildFallbackPostSession } from './postSessionFallback'

const POST_SESSION_SYSTEM = `You are the post-session focus coach for Anchor Vision.

Review the session event log and prior agent memory. Output JSON only — no markdown fences.

Schema:
${POST_SESSION_JSON_SCHEMA}

Rules:
- focusScore: 0-100 (higher = more focused; few triggers = higher; phone triggers hurt more than slouch)
- coachNote: 2-4 sentences, warm, weird, ADHD-aware, never shaming
- wins: 0-3 concrete wins from this session (e.g. bounced back fast, resisted phone, sat up after slouch nudge)
- nextTaskSuggestion: one specific task for their next block
- coachingAdjustments: 1-3 tweaks for next session's coaching tone/themes
- memorySnippets: 1-3 short recall lines for Redis semantic memory (what worked, patterns noticed)`

export type RunPostSessionInput = {
  profile: Profile
  session: SessionRecord
  events: SessionEventRecord[]
}

export type RunPostSessionOutput = {
  result: PostSessionResult
  updatedMemory: AgentMemory
}

export async function runPostSession(input: RunPostSessionInput): Promise<RunPostSessionOutput> {
  const memory = await loadAgentMemory(input.profile.userId)
  const endedAt = input.session.endedAt ?? Date.now()
  const durationMs = Math.max(0, endedAt - input.session.startedAt)

  const client = getAnthropicClient()
  if (!client) {
    const result = buildFallbackPostSession({
      session: { ...input.session, endedAt },
      events: input.events,
      memory
    })
    const updatedMemory = await applyMemoryUpdate(input.profile.userId, memory, result, [])
    return { result, updatedMemory }
  }

  const eventLines =
    input.events.length === 0
      ? 'No triggers fired this session.'
      : input.events
          .map(
            (event) =>
              `- ${new Date(event.timestamp).toISOString()} ${event.type} [${event.modality ?? 'quote'}]: "${event.quote}"`
          )
          .join('\n')

  const userMessage = [
    `Task intent: ${input.session.taskIntent}`,
    `Session duration: ${Math.round(durationMs / 1000)}s`,
    `Prior memory: sessions=${memory.totalSessions}, avg focus=${memory.focusScoreAvg.toFixed(0)}, insights=${memory.coachInsights.slice(-3).join(' | ') || 'none'}`,
    `Event log:\n${eventLines}`
  ].join('\n\n')

  try {
    const response = await client.messages.create({
      model: getPrepModel(),
      max_tokens: 2000,
      system: POST_SESSION_SYSTEM,
      messages: [{ role: 'user', content: userMessage }]
    })

    const text = response.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n')

    const parsed = parsePostSessionJson(text)
    if (!parsed) {
      console.warn('[post-session] parse failed — fallback')
      const result = buildFallbackPostSession({
        session: { ...input.session, endedAt },
        events: input.events,
        memory
      })
      const updatedMemory = await applyMemoryUpdate(input.profile.userId, memory, result, [])
      return { result, updatedMemory }
    }

    const slouchCount = input.events.filter((event) => event.type === 'slouch').length
    const phoneCount = input.events.filter((event) => event.type === 'phone').length

    const result: PostSessionResult = {
      sessionId: input.session.sessionId,
      focusScore: Math.max(0, Math.min(100, Math.round(parsed.focusScore))),
      coachNote: parsed.coachNote,
      summary: {
        slouchCount,
        phoneCount,
        totalTriggers: input.events.length,
        durationMs
      },
      wins: toWinEntries(input.session.sessionId, parsed.wins, endedAt),
      nextTaskSuggestion: parsed.nextTaskSuggestion,
      coachingAdjustments: parsed.coachingAdjustments,
      source: 'claude'
    }

    const snippets: MemorySnippet[] = parsed.memorySnippets.map((snippet) => ({
      id: uuidv4(),
      sessionId: input.session.sessionId,
      timestamp: endedAt,
      text: snippet.text,
      tags: snippet.tags ?? []
    }))

    const updatedMemory = await applyMemoryUpdate(
      input.profile.userId,
      memory,
      result,
      snippets
    )

    console.log('[post-session:claude] ok', {
      focusScore: result.focusScore,
      wins: result.wins.length
    })

    return { result, updatedMemory }
  } catch (err) {
    console.error('[post-session:claude] failed:', err)
    const result = buildFallbackPostSession({
      session: { ...input.session, endedAt },
      events: input.events,
      memory
    })
    const updatedMemory = await applyMemoryUpdate(input.profile.userId, memory, result, [])
    return { result, updatedMemory }
  }
}

async function applyMemoryUpdate(
  userId: string,
  memory: AgentMemory,
  result: PostSessionResult,
  snippets: MemorySnippet[]
): Promise<AgentMemory> {
  const sessionCount = memory.totalSessions + 1
  const focusScoreAvg =
    memory.totalSessions === 0
      ? result.focusScore
      : (memory.focusScoreAvg * memory.totalSessions + result.focusScore) / sessionCount

  const updated: AgentMemory = {
    ...memory,
    totalSessions: sessionCount,
    totalTriggers: memory.totalTriggers + result.summary.totalTriggers,
    slouchTriggers: memory.slouchTriggers + result.summary.slouchCount,
    phoneTriggers: memory.phoneTriggers + result.summary.phoneCount,
    focusScoreAvg,
    wins: [...memory.wins, ...result.wins].slice(-30),
    coachInsights: [...memory.coachInsights, ...result.coachingAdjustments].slice(-12),
    lastCoachNote: result.coachNote,
    updatedAt: Date.now()
  }

  await saveAgentMemory(userId, updated)
  await appendMemorySnippets(userId, snippets)
  return updated
}
