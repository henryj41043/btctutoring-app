import {downloadCsv, toCsvString} from './csv';

describe('toCsvString', () => {
  it('joins header and rows with CRLF and no trailing newline', () => {
    const csv = toCsvString(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('a,b\r\n1,2\r\n3,4');
  });

  it('leaves plain and empty fields unquoted', () => {
    expect(toCsvString(['x'], [['plain'], ['']])).toBe('x\r\nplain\r\n');
  });

  it('quotes fields containing commas', () => {
    expect(toCsvString(['x'], [['a,b']])).toBe('x\r\n"a,b"');
  });

  it('doubles embedded quotes and wraps the field', () => {
    expect(toCsvString(['x'], [['He said "hi"']])).toBe('x\r\n"He said ""hi"""');
    expect(toCsvString(['x'], [['"']])).toBe('x\r\n""""');
  });

  it('quotes fields containing newlines and carriage returns', () => {
    expect(toCsvString(['x'], [['line1\nline2']])).toBe('x\r\n"line1\nline2"');
    expect(toCsvString(['x'], [['line1\r\nline2']])).toBe('x\r\n"line1\r\nline2"');
  });

  it('quotes headers by the same rule', () => {
    expect(toCsvString(['a,b'], [])).toBe('"a,b"');
  });

  it('preserves leading/trailing spaces without quoting', () => {
    expect(toCsvString(['x'], [[' padded ']])).toBe('x\r\n padded ');
  });

  it('passes unicode through untouched', () => {
    expect(toCsvString(['x'], [['Beyoncé — 数学']])).toBe('x\r\nBeyoncé — 数学');
  });

  it('emits ragged rows as given', () => {
    expect(toCsvString(['a', 'b'], [['only-one']])).toBe('a,b\r\nonly-one');
  });
});

describe('downloadCsv', () => {
  // jsdom has no createObjectURL/revokeObjectURL — install stubs.
  const createStub = jest.fn(() => 'blob:fake');
  const revokeStub = jest.fn();
  let clickSpy: jest.SpyInstance;

  beforeEach(() => {
    createStub.mockClear();
    revokeStub.mockClear();
    (URL as unknown as Record<string, unknown>)['createObjectURL'] = createStub;
    (URL as unknown as Record<string, unknown>)['revokeObjectURL'] = revokeStub;
    clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  });

  afterEach(() => {
    clickSpy.mockRestore();
    delete (URL as unknown as Record<string, unknown>)['createObjectURL'];
    delete (URL as unknown as Record<string, unknown>)['revokeObjectURL'];
  });

  it('builds a BOM-prefixed CSV blob and clicks a download anchor', async () => {
    downloadCsv('scholarships-2026-08.csv', 'a,b\r\n1,2');

    expect(createStub).toHaveBeenCalledTimes(1);
    const blob = createStub.mock.calls[0][0] as Blob;
    expect(blob.type).toBe('text/csv;charset=utf-8');
    // The UTF-8 BOM prefix makes Excel decode correctly. FileReader consumes
    // the BOM as an encoding signature, so assert it via the byte count:
    // 'a,b\r\n1,2' is 8 bytes and the BOM adds 3.
    expect(blob.size).toBe(11);
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsText(blob);
    });
    expect(text).toBe('a,b\r\n1,2');
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(revokeStub).toHaveBeenCalledWith('blob:fake');
  });
});
