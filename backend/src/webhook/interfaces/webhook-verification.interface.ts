export interface WebhookVerificationResult {
  isValid: boolean
  error?: string
  timestamp?: number
}

export interface WebhookConfig {
  provider: string
  secret: string
  signatureHeader: string
  timestampHeader?: string
  toleranceSeconds: number
}

export interface ProcessedWebhook {
  id: string
  provider: string
  payload: any
  headers: Record<string, string>
  timestamp: number
  processingTime: number
}
