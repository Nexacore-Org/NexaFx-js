export interface CspNonceRequest extends Request {
  cspNonce?: string
}

export interface CspViolationReport {
  "document-uri": string
  referrer: string
  "violated-directive": string
  "effective-directive": string
  "original-policy": string
  disposition: "enforce" | "report"
  "blocked-uri": string
  "line-number"?: number
  "column-number"?: number
  "source-file"?: string
  "status-code": number
  "script-sample"?: string
}

export interface CspConfig {
  reportOnly: boolean
  directives: {
    [key: string]: string[] | boolean | string
  }
}

export interface CspStats {
  totalViolations: number
  recentViolations: number
  topViolatedDirectives: Array<{
    directive: string
    count: number
  }>
  topBlockedUris: Array<{
    uri: string
    count: number
  }>
}
