/**
 * Fails when a key declared in the Zod schema in `src/config/env.validation.ts`
 * has no entry in `.env.example`. CONTRIBUTING.md tells contributors to set up
 * their environment by copying `.env.example`, so a key that only exists in the
 * schema is invisible to anyone following the documented setup.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCHEMA_FILE = path.join(ROOT, 'src', 'config', 'env.validation.ts');
const ENV_EXAMPLE = path.join(ROOT, '.env.example');

const schemaSource = fs.readFileSync(SCHEMA_FILE, 'utf8');
const schemaBody = schemaSource.split('export const envSchema = z.object({')[1];

if (!schemaBody) {
  console.error(
    'Could not find `export const envSchema = z.object({` in src/config/env.validation.ts.',
  );
  process.exit(1);
}

// Top-level schema keys are the two-space-indented `KEY:` entries.
const schemaKeys = [...schemaBody.matchAll(/^ {2}([A-Z][A-Z0-9_]*):\s/gm)].map(
  (match) => match[1],
);

const exampleKeys = new Set(
  [
    ...fs.readFileSync(ENV_EXAMPLE, 'utf8').matchAll(/^\s*([A-Z][A-Z0-9_]*)=/gm),
  ].map((match) => match[1]),
);

const missing = schemaKeys.filter((key) => !exampleKeys.has(key));

if (missing.length > 0) {
  console.error(
    `.env.example is missing ${missing.length} key(s) declared in src/config/env.validation.ts:`,
  );
  missing.forEach((key) => console.error(`  - ${key}`));
  console.error(
    'Add each key to .env.example with a placeholder value and a comment describing it.',
  );
  process.exit(1);
}

console.log(
  `.env.example covers all ${schemaKeys.length} keys declared in the env schema.`,
);
