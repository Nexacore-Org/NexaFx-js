# Onboarding State Machine

## States
1. **unverified** — user registered, email not verified
2. **email_verified** — email confirmed, can access basic features
3. **kyc_submitted** — KYC documents uploaded, pending review
4. **kyc_approved** — KYC approved, full platform access

## Transitions
- Register → **unverified**
- Verify email → **email_verified**
- Submit KYC → **kyc_submitted**
- Admin approves KYC → **kyc_approved**

## Guard Protection
The `OnboardingGuard` blocks unverified users from financial endpoints (deposit, withdrawal, swap).
