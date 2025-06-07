export interface PasswordResetRequest {
  email: string
}

export interface PasswordResetConfirmation {
  token: string
  newPassword: string
  confirmPassword: string
}

export interface PasswordResetToken {
  userId: string
  email: string
  tokenHash: string
  expiresAt: Date
  attempts: number
  createdAt: Date
}

export interface PasswordResetResult {
  success: boolean
  message: string
  resetId?: string
  expiresAt?: Date
}

export interface TokenValidation {
  valid: boolean
  userId?: string
  email?: string
  expiresAt?: Date
  attemptsRemaining?: number
}

export interface PasswordRequirements {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  forbiddenPasswords: string[]
}
