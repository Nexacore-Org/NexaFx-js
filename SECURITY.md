# Security Policy

NexaFx-js handles real money movement and personally identifiable information. We take
vulnerability reports seriously and ask that you report suspected security issues responsibly,
as described below.

## Supported versions

NexaFx-js does not currently maintain multiple released versions in parallel — only the `main`
branch (and whatever is deployed from it) is supported. Security fixes are applied to `main` and
released as soon as practical; there is no backport policy for older commits.

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Anything else | ❌ |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.** Publicly disclosing a
vulnerability before a fix is available puts users' funds and data at risk.

Instead, report it privately using one of the following channels, in order of preference:

1. **GitHub Private Vulnerability Reporting** — open a draft security advisory from this
   repository's **Security** tab ("Report a vulnerability"). This is the preferred channel: it
   keeps the report private to maintainers until a fix is ready, and lets us coordinate a CVE and
   disclosure timeline directly in GitHub.
2. **Email** — if you cannot use GitHub's private reporting flow, email
   `security@nexacore.example` with a description of the issue, steps to reproduce, and its
   potential impact. *(Maintainers: replace this with a real, monitored security contact address
   before this policy goes live.)*

Please include as much of the following as you can:

- A description of the vulnerability and its potential impact (e.g. unauthorized fund movement,
  data exposure, authentication bypass).
- Steps to reproduce, or a proof-of-concept.
- The affected endpoint(s), file(s), or component(s), if known.
- Whether you believe the issue is being actively exploited.

## What to expect

- **Acknowledgement:** within 3 business days of your report.
- **Initial assessment:** within 10 business days, we'll share our assessment of severity and
  next steps.
- **Resolution:** timeline depends on severity and complexity; we'll keep you updated throughout.
- **Credit:** with your permission, we'll credit you in the release notes or advisory once the
  fix ships. Let us know if you'd prefer to remain anonymous.

We ask that you give us a reasonable window to fix the issue before any public disclosure, and
that you avoid accessing, modifying, or deleting data beyond what's necessary to demonstrate the
vulnerability.

## Scope

This policy covers the NexaFx-js application code in this repository: the API
(`ignition-api`/`src/`), authentication and authorization, wallet/ledger/transaction handling,
webhook delivery, and infrastructure configuration checked into this repo. Vulnerabilities in
third-party dependencies should generally be reported upstream, but we'd still like to know about
them if they affect this deployment.

## Related documentation

- [`docs/security.md`](docs/security.md) is an **internal engineering runbook** — secret/key
  rotation procedures, the GraphQL access model, and endpoint ownership rules. It documents how
  the system is *supposed* to work operationally; it is not a substitute for this disclosure
  policy, and it isn't where you should report a vulnerability.
