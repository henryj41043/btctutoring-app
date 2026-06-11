import { PhonePipe } from './phone.pipe';

describe('PhonePipe', () => {
  const pipe = new PhonePipe();

  it('formats a raw 10-digit number', () => {
    expect(pipe.transform('1234567890')).toBe('(123) 456 - 7890');
  });

  it('returns empty string for falsy values', () => {
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
  });
});
