import {AbstractControl, ValidationErrors} from '@angular/forms';

/** Extracts up to 10 US phone digits from any value. */
export function phoneDigits(value: unknown): string {
  return ('' + (value ?? '')).replace(/\D/g, '').slice(0, 10);
}

/**
 * Formats a US phone value as it is typed:
 *   ''            -> ''
 *   '123'         -> '(123'
 *   '123456'      -> '(123) 456'
 *   '1234567890'  -> '(123) 456 - 7890'
 * Accepts already-formatted input (re-derives from the digits).
 */
export function formatPhone(value: unknown): string {
  const d = phoneDigits(value);
  if (d.length === 0) return '';
  if (d.length <= 3) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)} - ${d.slice(6)}`;
}

/** Optional field: valid when empty, or when it contains exactly 10 digits. */
export function phoneValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  return phoneDigits(control.value).length === 10 ? null : { phoneNumber: true };
}
