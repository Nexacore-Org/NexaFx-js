/**
 * Fails when a non-relative import in src/ or test/ has no matching entry in
 * package.json dependencies/devDependencies (issue #1548). Transitive packages
 * resolve today but disappear when an upstream bump drops them, which breaks
 * `npm ci --omit=dev` images at boot.
 *
 * Usage: node scripts/check-undeclared-deps.js   (exit 1 on findings)
 */
const fs = require('fs');
const path = require('path');
const { findUndeclared } = require('./lib/undeclared-deps');

const ROOT = path.join(__dirname, '..');
const SOURCE_DIRS = ['src', 'test'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage']);

function collect(dir, out) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, out);
    else if (/\.(ts|js)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      out.push({ path: path.relative(ROOT, full), source: fs.readFileSync(full, 'utf8') });
    }
  }
}

const files = [];
for (const dir of SOURCE_DIRS) collect(path.join(ROOT, dir), files);

const pkg = require(path.join(ROOT, 'package.json'));
// tsconfig "paths" aliases such as `src/*` are not npm packages.
const undeclared = findUndeclared(files, pkg, { pathAliases: ['src', 'test'] });

if (undeclared.size > 0) {
  console.error('Imported but not declared in package.json:');
  for (const [name, users] of [...undeclared.entries()].sort()) {
    const shown = users.slice(0, 3).join(', ') + (users.length > 3 ? `, +${users.length - 3} more` : '');
    console.error(`  ${name}  (${shown})`);
  }
  process.exit(1);
}
console.log(`All imports in ${SOURCE_DIRS.join(', ')} are declared in package.json.`);
