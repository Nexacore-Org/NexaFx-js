/**
 * `src/main.ts` calls `app.setGlobalPrefix('api/v1')`, so a controller that also
 * hardcodes the prefix in its `@Controller()` decorator is served at
 * `/api/v1/api/v1/...`. This fails the build when any controller path repeats
 * the global prefix.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MAIN = path.join(SRC, 'main.ts');

const mainSource = fs.readFileSync(MAIN, 'utf8');

/** Reads the prefix from setGlobalPrefix(), whether inline or via a constant. */
const readGlobalPrefix = () => {
  const literal = mainSource.match(/setGlobalPrefix\(\s*['"]([^'"]+)['"]/);
  if (literal) return literal[1];

  const identifier = mainSource.match(/setGlobalPrefix\(\s*([A-Za-z_$][\w$]*)\s*\)/);
  if (!identifier) return null;

  const declaration = mainSource.match(
    new RegExp(`const\\s+${identifier[1]}\\s*=\\s*['"]([^'"]+)['"]`),
  );
  return declaration ? declaration[1] : null;
};

const rawPrefix = readGlobalPrefix();

if (!rawPrefix) {
  console.log('No global prefix configured in src/main.ts; nothing to check.');
  process.exit(0);
}

const globalPrefix = rawPrefix.replace(/^\/+|\/+$/g, '');

const walk = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && full.endsWith('.ts') ? [full] : [];
  });

const offenders = [];

for (const file of walk(SRC)) {
  const source = fs.readFileSync(file, 'utf8');
  for (const match of source.matchAll(/@Controller\(\s*['"]([^'"]*)['"]/g)) {
    const controllerPath = match[1].replace(/^\/+/, '');
    if (
      controllerPath === globalPrefix ||
      controllerPath.startsWith(`${globalPrefix}/`)
    ) {
      offenders.push({
        file: path.relative(ROOT, file),
        controllerPath: match[1],
      });
    }
  }
}

if (offenders.length > 0) {
  console.error(
    `${offenders.length} controller(s) repeat the global prefix "${globalPrefix}", so they are served at /${globalPrefix}/${globalPrefix}/...:`,
  );
  offenders.forEach(({ file, controllerPath }) =>
    console.error(`  - ${file}: @Controller('${controllerPath}')`),
  );
  console.error(
    `Drop "${globalPrefix}/" from the decorator — setGlobalPrefix in src/main.ts already adds it.`,
  );
  process.exit(1);
}

console.log(
  `No controller repeats the global prefix "${globalPrefix}".`,
);
