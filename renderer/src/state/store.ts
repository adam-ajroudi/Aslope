// Zustand store added in M2+ when session/nudge state is wired
export type AppState = {
  sessionId: string | null
}

export const initialAppState: AppState = {
  sessionId: null
}
