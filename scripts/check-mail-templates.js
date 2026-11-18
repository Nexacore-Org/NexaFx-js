#!/usr/bin/env node
/**
 * `nest build` only emits compiled JavaScript unless `nest-cli.json` copies
 * the mail templates as assets. This postbuild guard fails the build when a
 * template is missing from `dist`, instead of letting production fail with
 * ENOENT on the first send.
 */
const { existsSync } = require('fs');
const { join } = require('path');

const templatesDir = join(__dirname, '..', 'dist', 'mail', 'templates');
const required = [
  'base.hbs',
  'password-reset.hbs',
  'transaction-confirmation.hbs',
  'welcome.hbs',
  'email-verification.en.hbs',
  'email-verification.fr.hbs',
];

const missing = required.filter((name) => !existsSync(join(templatesDir, name)));

if (missing.length > 0) {
  console.error(
    `Missing mail templates in ${templatesDir}:\n` +
      missing.map((name) => `  - ${name}`).join('\n'),
  );
  process.exit(1);
}

console.log(`All ${required.length} mail templates are present in dist.`);
