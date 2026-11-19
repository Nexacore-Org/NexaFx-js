import {
  AUDIT_CSV_COLUMNS,
  auditCsvHeader,
  auditRowToCsv,
  escapeCsvCell,
  mapAuditRow,
} from './audit-export.service';

describe('AuditExportService CSV helpers', () => {
  it('writes a header row with the AuditLog field names', () => {
    expect(auditCsvHeader()).toBe(AUDIT_CSV_COLUMNS.join(','));
    expect(auditCsvHeader()).toContain('createdAt');
    expect(auditCsvHeader()).not.toContain('log_');
  });

  it('maps TypeORM aliases to entity field names', () => {
    expect(
      mapAuditRow({
        log_id: 'log-1',
        log_userId: 'user-1',
        log_action: 'auth.login',
        log_entityType: 'user',
        log_entityId: 'user-1',
        log_before: null,
        log_after: { ok: true },
        log_reason: null,
        log_ipAddress: '127.0.0.1',
        log_userAgent: 'jest',
        log_createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
    ).toEqual({
      id: 'log-1',
      userId: 'user-1',
      action: 'auth.login',
      entityType: 'user',
      entityId: 'user-1',
      before: null,
      after: { ok: true },
      reason: null,
      ipAddress: '127.0.0.1',
      userAgent: 'jest',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
  });

  it('quotes commas, quotes and newlines per RFC 4180', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('neutralises spreadsheet formulas and serialises objects', () => {
    expect(escapeCsvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(escapeCsvCell('+1')).toBe("'+1");
    expect(escapeCsvCell('-1')).toBe("'-1");
    expect(escapeCsvCell('@cmd')).toBe("'@cmd");
    expect(escapeCsvCell({ ok: true })).toBe('"{""ok"":true}"');
    expect(escapeCsvCell(null)).toBe('');
  });

  it('renders a complete CSV row with the mapped values', () => {
    const row = auditRowToCsv({
      log_id: 'log-1',
      log_userId: 'user-1',
      log_action: 'auth.login',
      log_entityType: 'user',
      log_entityId: null,
      log_before: null,
      log_after: null,
      log_reason: null,
      log_ipAddress: null,
      log_userAgent: null,
      log_createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const expected = [
      'log-1',
      'user-1',
      'auth.login',
      'user',
      '',
      '',
      '',
      '',
      '',
      '',
      '2026-01-01T00:00:00.000Z',
    ].join(',');
    expect(row).toBe(expected);
  });
});
