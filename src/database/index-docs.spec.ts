import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Issue #1544: docs/database-indexes.md listed indexes that no migration created.
 * This pins the Transaction and AuditLog rows of the doc to the entities and the
 * migrations so the doc cannot drift again.
 */
const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');

const normalise = (cols: string) =>
  cols
    .replace(/["'`\s]/g, '')
    .split(',')
    .filter(Boolean)
    .join(',');

function docRows(section: string): string[] {
  const doc = read('docs', 'database-indexes.md');
  const body = doc.split(new RegExp(`^## ${section}\\s*$`, 'm'))[1]?.split(/^## /m)[0] ?? '';
  const rows: string[] = [];
  for (const line of body.split('\n')) {
    const cells = line.split('|').map((c) => c.trim());
    // | Kind | `cols` | Rationale |
    if (cells.length >= 4 && (cells[1] === 'Composite' || cells[1] === 'Single')) {
      rows.push(normalise(cells[2].replace(/[()`]/g, '')));
    }
  }
  return rows;
}

function entityIndexes(file: string): Set<string> {
  const source = read(...file.split('/'));
  const found = new Set<string>();
  for (const m of source.matchAll(/@Index\(\s*(?:'[^']*'\s*,\s*)?\[([^\]]*)\]/g)) {
    found.add(normalise(m[1]));
  }
  return found;
}

function migrationIndexes(table: string): Set<string> {
  const dir = join(ROOT, 'src', 'database', 'migrations');
  const found = new Set<string>();
  const pattern = new RegExp(`CREATE\\s+(?:UNIQUE\\s+)?INDEX[^;]*?ON\\s+"${table}"\\s*\\(([^)]*)\\)`, 'gi');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    for (const m of readFileSync(join(dir, file), 'utf8').matchAll(pattern)) {
      found.add(normalise(m[1]));
    }
  }
  return found;
}

describe('docs/database-indexes.md matches entities and migrations (issue #1544)', () => {
  const cases: Array<[string, string, string]> = [
    ['Transaction', 'src/transactions/transaction.entity.ts', 'transactions'],
    ['AuditLog', 'src/audit/audit-log.entity.ts', 'audit_logs'],
  ];

  it.each(cases)('%s rows exist in the entity and in a migration', (section, entityFile, table) => {
    const rows = docRows(section);
    expect(rows.length).toBeGreaterThan(0);

    const inEntity = entityIndexes(entityFile);
    const inMigrations = migrationIndexes(table);

    for (const cols of rows) {
      expect({ section, cols, entity: inEntity.has(cols) }).toEqual({ section, cols, entity: true });
      expect({ section, cols, migration: inMigrations.has(cols) }).toEqual({ section, cols, migration: true });
    }
  });

  it('the new migration runs outside a transaction (CONCURRENTLY)', () => {
    const source = read('src', 'database', 'migrations', 'AddMissingCoreIndexes1753200000000.ts');
    expect(source).toContain('transaction = false');
    expect(source.match(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/g)).toHaveLength(4);
  });
});
