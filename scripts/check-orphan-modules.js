/**
 * Reports `*.module.ts` files that nothing reachable from src/app.module.ts or src/main.ts imports.
 * Exits 1 for orphans missing from scripts/orphan-modules.allowlist.json (a JSON array of paths,
 * seeded from this script's output) and for stale allowlist entries (issue #1400).
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const ALLOW = path.join(__dirname, 'orphan-modules.allowlist.json');
const seen = new Set();
const queue = ['app.module.ts', 'main.ts'].map((f) => path.join(SRC, f));
while (queue.length) {
  const file = queue.pop();
  if (seen.has(file) || !fs.existsSync(file)) continue;
  seen.add(file);
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/from\s+'(\.[^']*)'/g)) {
    const base = path.resolve(path.dirname(file), m[1]);
    queue.push(`${base}.ts`, path.join(base, 'index.ts'));
  }
}
const walk = (d) =>
  fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(d, e.name);
    return e.isDirectory() ? walk(p) : p.endsWith('.module.ts') ? [p] : [];
  });
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const orphans = walk(SRC).filter((f) => !seen.has(f)).map(rel).sort();
const allow = fs.existsSync(ALLOW) ? JSON.parse(fs.readFileSync(ALLOW, 'utf8')) : [];
const fresh = orphans.filter((f) => !allow.includes(f));
const stale = allow.filter((f) => !orphans.includes(f));
fresh.forEach((f) => console.error(`Orphan module: ${f}`));
stale.forEach((f) => console.error(`Stale allowlist entry: ${f}`));
if (fresh.length || stale.length) process.exit(1);
console.log(`check-orphan-modules: ${orphans.length} allowlisted orphan(s), no new ones.`);
