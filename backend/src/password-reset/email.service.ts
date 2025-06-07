import { Injectable, Logger } from "@nestjs/common"
import type { ConfigService } from "@nestjs/config"

interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

interface EmailTemplate {
  subject: string
  html: string
  text: string
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name)

  constructor(private readonly configService: ConfigService) {}

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(user: User, resetToken: string): Promise<void> {
    try {
      const resetUrl = this.buildResetUrl(resetToken)
      const template = this.getPasswordResetTemplate(user, resetUrl)

      await this.sendEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      })

      this.logger.log(`Password reset email sent to ${user.email}`)
    } catch (error) {
      this.logger.error(`Failed to send password reset email to ${user.email}: ${error.message}`)
      throw error
    }
  }

  /**
   * Send password reset confirmation email
   */
  async sendPasswordResetConfirmationEmail(user: User): Promise<void> {
    try {
      const template = this.getPasswordResetConfirmationTemplate(user)

      await this.sendEmail({
        to: user.email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      })

      this.logger.log(`Password reset confirmation email sent to ${user.email}`)
    } catch (error) {
      this.logger.error(`Failed to send password reset confirmation email to ${user.email}: ${error.message}`)
      throw error
    }
  }

  /**
   * Build password reset URL
   */
  private buildResetUrl(token: string): string {
    const frontendUrl = this.configService.get<string>("FRONTEND_URL", "http://localhost:3000")
    return `${frontendUrl}/auth/reset-password?token=${token}`
  }

  /**
   * Get password reset email template
   */
  private getPasswordResetTemplate(user: User, resetUrl: string): EmailTemplate {
    const appName = this.configService.get<string>("APP_NAME", "MyApp")
    const expiryMinutes = this.configService.get<string>("PASSWORD_RESET_TOKEN_EXPIRY", "60")

    const firstName = user.firstName || "User"

    const subject = `Reset your ${appName} password`

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #e9ecef; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6c757d; }
            .button { display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0; }
            .warning { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
            .security-tips { background-color: #f8f9fa; padding: 15px; border-radius: 4px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${appName}</h1>
              <h2>Password Reset Request</h2>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              
              <p>We received a request to reset your password for your ${appName} account. If you made this request, click the button below to reset your password:</p>
              
              <div style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </div>
              
              <p>Or copy and paste this link into your browser:</p>
              <p style="word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
                ${resetUrl}
              </p>
              
              <div class="warning">
                <strong>⚠️ Important:</strong>
                <ul>
                  <li>This link will expire in ${expiryMinutes} minutes</li>
                  <li>You can only use this link once</li>
                  <li>If you didn't request this reset, please ignore this email</li>
                </ul>
              </div>
              
              <div class="security-tips">
                <strong>🔒 Security Tips:</strong>
                <ul>
                  <li>Choose a strong, unique password</li>
                  <li>Use a combination of letters, numbers, and special characters</li>
                  <li>Don't reuse passwords from other accounts</li>
                  <li>Consider using a password manager</li>
                </ul>
              </div>
              
              <p>If you continue to have problems, please contact our support team.</p>
              
              <p>Best regards,<br>The ${appName} Team</p>
            </div>
            <div class="footer">
              <p>This email was sent to ${user.email}. If you didn't request this password reset, please ignore this email.</p>
              <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const text = `
      Hello ${firstName},

      We received a request to reset your password for your ${appName} account.

      To reset your password, please visit the following link:
      ${resetUrl}

      This link will expire in ${expiryMinutes} minutes and can only be used once.

      If you didn't request this password reset, please ignore this email.

      Security Tips:
      - Choose a strong, unique password
      - Use a combination of letters, numbers, and special characters
      - Don't reuse passwords from other accounts
      - Consider using a password manager

      Best regards,
      The ${appName} Team

      This email was sent to ${user.email}.
    `

    return { subject, html, text }
  }

  /**
   * Get password reset confirmation email template
   */
  private getPasswordResetConfirmationTemplate(user: User): EmailTemplate {
    const appName = this.configService.get<string>("APP_NAME", "MyApp")
    const firstName = user.firstName || "User"

    const subject = `Your ${appName} password has been reset`

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${subject}</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #d4edda; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background-color: #ffffff; padding: 30px; border: 1px solid #e9ecef; }
            .footer { background-color: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; font-size: 12px; color: #6c757d; }
            .success { background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 4px; margin: 20px 0; color: #155724; }
            .security-notice { background-color: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 4px; margin: 20px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${appName}</h1>
              <h2>✅ Password Reset Successful</h2>
            </div>
            <div class="content">
              <p>Hello ${firstName},</p>
              
              <div class="success">
                <strong>Your password has been successfully reset!</strong>
              </div>
              
              <p>Your ${appName} account password was changed on ${new Date().toLocaleString()}.</p>
              
              <div class="security-notice">
                <strong>🔒 Security Notice:</strong>
                <p>If you did not make this change, please contact our support team immediately. Your account may have been compromised.</p>
              </div>
              
              <p><strong>What happens next?</strong></p>
              <ul>
                <li>You can now log in with your new password</li>
                <li>All existing sessions have been terminated for security</li>
                <li>You'll need to log in again on all devices</li>
              </ul>
              
              <p><strong>Security Recommendations:</strong></p>
              <ul>
                <li>Keep your password secure and don't share it</li>
                <li>Enable two-factor authentication if available</li>
                <li>Regularly review your account activity</li>
                <li>Log out from shared or public devices</li>
              </ul>
              
              <p>Thank you for keeping your account secure!</p>
              
              <p>Best regards,<br>The ${appName} Team</p>
            </div>
            <div class="footer">
              <p>This email was sent to ${user.email} for security purposes.</p>
              <p>© ${new Date().getFullYear()} ${appName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `

    const text = `
      Hello ${firstName},

      Your ${appName} account password was successfully reset on ${new Date().toLocaleString()}.

      If you did not make this change, please contact our support team immediately.

      What happens next:
      - You can now log in with your new password
      - All existing sessions have been terminated for security
      - You'll need to log in again on all devices

      Security Recommendations:
      - Keep your password secure and don't share it
      - Enable two-factor authentication if available
      - Regularly review your account activity
      - Log out from shared or public devices

      Best regards,
      The ${appName} Team

      This email was sent to ${user.email} for security purposes.
    `

    return { subject, html, text }
  }

  /**
   * Send email (mock implementation - replace with actual email service)
   */
  private async sendEmail(options: {
    to: string
    subject: string
    html: string
    text: string
  }): Promise<void> {
    // Mock implementation - replace with actual email service (SendGrid, AWS SES, etc.)
    this.logger.log(`[MOCK EMAIL] Sending email to ${options.to}`)
    this.logger.log(`[MOCK EMAIL] Subject: ${options.subject}`)
    this.logger.log(`[MOCK EMAIL] Text: ${options.text.substring(0, 100)}...`)

    // Simulate email sending delay
    await new Promise((resolve) => setTimeout(resolve, 100))

    // In production, replace with actual email service:
    /*
    const transporter = nodemailer.createTransporter({
      // Your email service configuration
    });
    
    await transporter.sendMail({
      from: this.configService.get('EMAIL_FROM'),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    });
    */
  }
}
