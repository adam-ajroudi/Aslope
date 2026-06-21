import type { WinEntry } from './agentMemory'

export type PostSessionAnalysisJson = {
  focusScore: number
  coachNote: string
  wins: Array<{ title: string; detail: string; triggerType?: 'slouch' | 'phone' }>
  nextTaskSuggestion: string
  coachingAdjustments: string[]
  memorySnippets: Array<{ text: string; tags?: string[] }>
}

export const POST_SESSION_JSON_SCHEMA = `{
  "focusScore": 0,
  "coachNote": "string",
  "wins": [{ "title": "string", "detail": "string", "triggerType": "slouch|phone" }],
  "nextTaskSuggestion": "string",
  "coachingAdjustments": ["string"],
  "memorySnippets": [{ "text": "string", "tags": ["string"] }]
}`

export function parsePostSessionJson(raw: string): PostSessionAnalysisJson | null {
  const trimmed = raw.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  try {
    const parsed = JSON.parse(unfenced) as PostSessionAnalysisJson
    if (!isValidAnalysis(parsed)) return null
    return parsed
  } catch {
    return null
  }
}

function isValidAnalysis(value: unknown): value is PostSessionAnalysisJson {
  if (!value || typeof value !== 'object') return false
  const v = value as PostSessionAnalysisJson
  return (
    typeof v.focusScore === 'number' &&
    typeof v.coachNote === 'string' &&
    Array.isArray(v.wins) &&
    typeof v.nextTaskSuggestion === 'string' &&
    Array.isArray(v.coachingAdjustments) &&
    Array.isArray(v.memorySnippets)
  )
}

export function toWinEntries(
  sessionId: string,
  wins: PostSessionAnalysisJson['wins'],
  timestamp: number
): WinEntry[] {
  return wins.map((win, index) => ({
    id: `${sessionId}-win-${index}`,
    sessionId,
    timestamp,
    title: win.title,
    detail: win.detail,
    triggerType: win.triggerType
  }))
}
