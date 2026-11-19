/**
 * Fails when a bare `@Cron(` decorator is used outside the ClusterCron wrapper
 * (issue #1550). A bare @Cron runs on every replica, so each tick executes N
 * times against the same database.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const ALLOWED = new Set([path.join('common', 'locks', 'cluster-cron.decorator.ts')]);
const offenders = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      const rel = path.relative(ROOT, full);
      if (ALLOWED.has(rel)) continue;
      fs.readFileSync(full, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/^\s*@Cron\(/.test(line)) offenders.push(`${path.join('src', rel)}:${i + 1}`);
        });
    }
  }
}

walk(ROOT);
if (offenders.length > 0) {
  console.error('Bare @Cron( found; use @ClusterCron(expression, lockKey):');
  offenders.forEach((o) => console.error(`  ${o}`));
  process.exit(1);
}
console.log('No bare @Cron( decorators.');
