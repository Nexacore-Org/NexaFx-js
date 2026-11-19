/**
 * Finds npm packages imported by source files but not declared in package.json
 * (issue #1548). Pure functions so they can be unit tested with fixtures.
 */
const { builtinModules } = require('module');

const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

// import x from 'pkg' | import 'pkg' | export ... from 'pkg' | require('pkg') | import('pkg')
const IMPORT_PATTERNS = [
  /(?:^|[\s;])import\s+(?:[^'";]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /(?:^|[\s;])export\s+[^'";]*?\s+from\s+['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
];

/** `@scope/pkg/sub/path` -> `@scope/pkg`; `pkg/sub` -> `pkg`; relative/builtin -> null */
function packageNameFromSpecifier(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) return null;
  if (BUILTINS.has(specifier) || BUILTINS.has(specifier.split('/')[0])) return null;
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0];
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function extractImportedPackages(source) {
  const found = new Set();
  const text = stripComments(source);
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const name = packageNameFromSpecifier(match[1]);
      if (name) found.add(name);
    }
  }
  return found;
}

/**
 * `files` is an array of { path, source }. Returns a Map of undeclared package
 * name -> sorted list of files that import it.
 */
function findUndeclared(files, pkg, { pathAliases = [] } = {}) {
  const declared = new Set([
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ]);
  const aliases = new Set(pathAliases);
  const result = new Map();
  for (const file of files) {
    for (const name of extractImportedPackages(file.source)) {
      if (declared.has(name) || aliases.has(name)) continue;
      if (!result.has(name)) result.set(name, new Set());
      result.get(name).add(file.path);
    }
  }
  return new Map([...result.entries()].map(([name, set]) => [name, [...set].sort()]));
}

module.exports = { packageNameFromSpecifier, extractImportedPackages, findUndeclared };
