import {formatFileSize} from './file-size';

describe('formatFileSize', () => {
  it.each([
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1 KB'],
    [1536, '2 KB'],
    [1048575, '1024 KB'],
    [1048576, '1.0 MB'],
    [1468006, '1.4 MB'],
    [15728640, '15.0 MB'],
  ])('%d bytes reads %s', (bytes, text) => {
    expect(formatFileSize(bytes)).toBe(text);
  });

  it.each([null, undefined, NaN, Infinity, -1])('is empty for %p', value => {
    expect(formatFileSize(value)).toBe('');
  });
});
