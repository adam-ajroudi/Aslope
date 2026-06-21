export type ReverseNudgePayload = {
  incidentId: string
  errorMessage: string
  component: string
  plea: string
  seerVibe: string
  vibeLabel: string
  banterIndex: number
  timestamp: number
}

export type DevCoachSubmitPayload = {
  incidentId: string
  coachMessage: string
}

export type DevCoachEntry = {
  id: string
  incidentId: string
  timestamp: number
  errorMessage: string
  component: string
  plea: string
  coachMessage: string
  seerComeback: string
  seerVibe: string
  vibeLabel: string
  banterIndex: number
}
