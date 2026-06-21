import type {
  AgentMemory,
  PostSessionResult,
  SessionEventRecord,
  SessionRecord,
  WinEntry
} from '@shared/agentMemory'

export function buildFallbackPostSession(input: {
  session: SessionRecord
  events: SessionEventRecord[]
  memory: AgentMemory
}): PostSessionResult {
  const slouchCount = input.events.filter((event) => event.type === 'slouch').length
  const phoneCount = input.events.filter((event) => event.type === 'phone').length
  const totalTriggers = input.events.length
  const endedAt = input.session.endedAt ?? Date.now()
  const durationMs = Math.max(0, endedAt - input.session.startedAt)

  const focusScore = Math.max(
    20,
    Math.min(100, 100 - slouchCount * 8 - phoneCount * 12 + (totalTriggers === 0 ? 10 : 0))
  )

  const wins: WinEntry[] = []
  if (totalTriggers === 0) {
    wins.push({
      id: `${input.session.sessionId}-win-0`,
      sessionId: input.session.sessionId,
      timestamp: endedAt,
      title: 'Clean focus block',
      detail: `You stayed locked in on ${input.session.taskIntent} with zero drift triggers.`
    })
  } else if (phoneCount === 0) {
    wins.push({
      id: `${input.session.sessionId}-win-0`,
      sessionId: input.session.sessionId,
      timestamp: endedAt,
      title: 'Phone discipline',
      detail: 'No phone pickups detected — your dopamine baseline stayed yours.'
    })
  }

  const coachNote =
    totalTriggers === 0
      ? `You ran a quiet session on "${input.session.taskIntent}" — that is rare and real. Next time, same energy.`
      : `You took ${totalTriggers} coaching nudges (${slouchCount} posture, ${phoneCount} phone) while working on "${input.session.taskIntent}". Awareness is the whole game — next session we lean harder into what snapped you back fastest.`

  return {
    sessionId: input.session.sessionId,
    focusScore,
    coachNote,
    summary: {
      slouchCount,
      phoneCount,
      totalTriggers,
      durationMs
    },
    wins,
    nextTaskSuggestion: input.session.taskIntent,
    coachingAdjustments: [
      slouchCount > phoneCount
        ? 'Lean into weirder spine-aging coaching lines'
        : 'Lean into dopamine-baseline phone coaching lines'
    ],
    source: 'fallback'
  }
}
