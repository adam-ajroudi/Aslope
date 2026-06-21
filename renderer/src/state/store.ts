// Session/nudge state lives in App.tsx for M2; Zustand in M3+
export type AppState = {
  sessionId: string | null
}

export const initialAppState: AppState = {
  sessionId: null
}
