/**
 * Fails when any relative import in `src/app.module.ts` points at a file that does
 * not exist on disk. Every one of those is a `TS2307: Cannot find module` the moment
 * the project typechecks cleanly, so this guards the root module against silently
 * regressing to a list of dangling imports.
 */
const fs = require('fs');
const path = require('path');

const APP_MODULE = path.join(__dirname, '..', 'src', 'app.module.ts');
const EXTENSIONS = ['.ts', '.tsx', '.js'];

const source = fs.readFileSync(APP_MODULE, 'utf8');
const specifiers = new Set(
  [...source.matchAll(/from\s+'(\.[^']*)'/g)].map((match) => match[1]),
);

const resolves = (specifier) => {
  const base = path.resolve(path.dirname(APP_MODULE), specifier);
  return EXTENSIONS.some(
    (ext) => fs.existsSync(base + ext) || fs.existsSync(path.join(base, `index${ext}`)),
  );
};

const dangling = [...specifiers].filter((specifier) => !resolves(specifier)).sort();

if (dangling.length > 0) {
  console.error(
    `Dangling relative imports in src/app.module.ts (${dangling.length}):`,
  );
  dangling.forEach((specifier) => console.error(`  - ${specifier}`));
  console.error(
    'Point each import at an existing module, or remove it along with its imports[] entry.',
  );
  process.exit(1);
}

console.log(
  `src/app.module.ts: all ${specifiers.size} relative imports resolve to a file on disk.`,
);
