import { FormControl } from '@angular/forms';
import { formatPhone, phoneDigits, phoneValidator } from './phone.util';

describe('phone.util', () => {
  describe('phoneDigits', () => {
    it('extracts up to 10 digits, stripping non-digits', () => {
      expect(phoneDigits('(123) 456 - 7890')).toBe('1234567890');
    });

    it('truncates anything beyond 10 digits', () => {
      expect(phoneDigits('123456789012345')).toBe('1234567890');
    });

    it.each([
      [null, ''],
      [undefined, ''],
      ['', ''],
      ['abc', ''],
    ])('returns empty for %p', (input, expected) => {
      expect(phoneDigits(input)).toBe(expected);
    });
  });

  describe('formatPhone', () => {
    it.each([
      ['', ''],
      ['1', '(1'],
      ['123', '(123'],
      ['1234', '(123) 4'],
      ['123456', '(123) 456'],
      ['1234567', '(123) 456 - 7'],
      ['1234567890', '(123) 456 - 7890'],
    ])('formats %p as %p', (input, expected) => {
      expect(formatPhone(input)).toBe(expected);
    });

    it('re-derives formatting from already-formatted input', () => {
      expect(formatPhone('(123) 456 - 7890')).toBe('(123) 456 - 7890');
    });

    it('handles nullish input', () => {
      expect(formatPhone(undefined)).toBe('');
    });
  });

  describe('phoneValidator', () => {
    it('passes for an empty optional field', () => {
      expect(phoneValidator(new FormControl(''))).toBeNull();
    });

    it('passes for exactly 10 digits', () => {
      expect(phoneValidator(new FormControl('(123) 456 - 7890'))).toBeNull();
    });

    it('fails for fewer than 10 digits', () => {
      expect(phoneValidator(new FormControl('12345'))).toEqual({
        phoneNumber: true,
      });
    });
  });
});
