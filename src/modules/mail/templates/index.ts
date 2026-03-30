export function passwordResetTemplate(resetUrl: string): string {
  return `<!DOCTYPE html><html><body>
<h2>Password Reset</h2>
<p>Click the link below to reset your password. This link expires in 15 minutes.</p>
<a href="${resetUrl}">Reset Password</a>
<p>If you did not request this, ignore this email.</p>
</body></html>`;
}

export function emailVerificationTemplate(verifyUrl: string): string {
  return `<!DOCTYPE html><html><body>
<h2>Verify Your Email</h2>
<p>Click the link below to verify your email address.</p>
<a href="${verifyUrl}">Verify Email</a>
</body></html>`;
}

export function newDeviceLoginTemplate(ip: string, userAgent: string): string {
  return `<!DOCTYPE html><html><body>
<h2>New Device Login Detected</h2>
<p>A login was detected from a new device or IP address.</p>
<p><strong>IP:</strong> ${ip}</p>
<p><strong>Device:</strong> ${userAgent}</p>
<p>If this was not you, please secure your account immediately.</p>
</body></html>`;
}

export function accountLockedTemplate(): string {
  return `<!DOCTYPE html><html><body>
<h2>Account Locked</h2>
<p>Your account has been temporarily locked due to multiple failed login attempts.</p>
<p>Please contact support or reset your password to regain access.</p>
</body></html>`;
}
