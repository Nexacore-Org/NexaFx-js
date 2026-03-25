import { Controller, Get, Header } from '@nestjs/common';
import { SkipAudit } from '../../admin-audit/decorators/skip-audit.decorator';
import { WEBHOOK_EVENT_CATALOG } from '../webhook-event-catalog';

@Controller('developer')
export class DeveloperPortalController {
  @Get()
  @SkipAudit()
  @Header('Content-Type', 'text/html; charset=utf-8')
  getPortal(): string {
    const eventCards = WEBHOOK_EVENT_CATALOG.map(
      (event) => `
        <section class="card">
          <h2>${event.displayName}</h2>
          <p><strong>Event:</strong> <code>${event.eventName}</code></p>
          <p>${event.description}</p>
          <pre>${escapeHtml(JSON.stringify(event.samplePayload, null, 2))}</pre>
        </section>
      `,
    ).join('');

    return `
      <!doctype html>
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <title>NexaFx Developer Portal</title>
          <style>
            :root {
              --bg: #f4efe7;
              --panel: #fffaf3;
              --ink: #1f2a37;
              --muted: #556070;
              --accent: #d36b2b;
              --line: #e6dac7;
              --code: #132033;
            }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              font-family: Georgia, "Times New Roman", serif;
              background:
                radial-gradient(circle at top left, rgba(211, 107, 43, 0.12), transparent 30%),
                linear-gradient(180deg, #f8f4ec 0%, var(--bg) 100%);
              color: var(--ink);
            }
            main {
              max-width: 1080px;
              margin: 0 auto;
              padding: 48px 20px 64px;
            }
            .hero {
              background: var(--panel);
              border: 1px solid var(--line);
              border-radius: 24px;
              padding: 32px;
              box-shadow: 0 20px 60px rgba(19, 32, 51, 0.08);
            }
            h1 {
              margin: 0 0 12px;
              font-size: clamp(2rem, 5vw, 3.75rem);
              line-height: 0.95;
            }
            .lede {
              color: var(--muted);
              font-size: 1.05rem;
              max-width: 760px;
            }
            .meta {
              display: grid;
              gap: 16px;
              grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
              margin-top: 28px;
            }
            .pill {
              background: rgba(211, 107, 43, 0.08);
              border: 1px solid rgba(211, 107, 43, 0.2);
              border-radius: 18px;
              padding: 16px 18px;
            }
            .grid {
              display: grid;
              gap: 20px;
              grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
              margin-top: 28px;
            }
            .card {
              background: var(--panel);
              border: 1px solid var(--line);
              border-radius: 20px;
              padding: 22px;
            }
            h2 {
              margin-top: 0;
              margin-bottom: 10px;
              font-size: 1.35rem;
            }
            code, pre {
              font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
            }
            code {
              color: var(--code);
            }
            pre {
              background: #fff;
              color: var(--code);
              border: 1px solid var(--line);
              border-radius: 14px;
              padding: 14px;
              overflow: auto;
              font-size: 0.88rem;
              line-height: 1.45;
            }
          </style>
        </head>
        <body>
          <main>
            <section class="hero">
              <h1>NexaFx Webhook Developer Portal</h1>
              <p class="lede">
                Subscribe to NexaFx domain events, verify signatures with the official TypeScript SDK,
                and use the sandbox endpoint to test your receiver with real HMAC-signed deliveries.
              </p>
              <div class="meta">
                <div class="pill"><strong>Subscribe:</strong> <code>POST /webhooks</code></div>
                <div class="pill"><strong>Sandbox:</strong> <code>POST /webhooks/sandbox/:eventType</code></div>
                <div class="pill"><strong>Verify:</strong> headers <code>x-nexafx-signature</code> and <code>x-nexafx-timestamp</code></div>
              </div>
            </section>
            <section class="grid">${eventCards}</section>
          </main>
        </body>
      </html>
    `;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}
