import {AbstractControl, ValidationErrors, Validators} from '@angular/forms';

/**
 * Email format check for an OPTIONAL field: blank or whitespace-only counts as
 * "no email" and passes; anything else must be a valid address. (Angular's
 * Validators.email accepts '' but rejects '   ', which a user can easily
 * leave behind.)
 */
export function optionalEmailValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value as string | null | undefined;
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }
  return Validators.email(control);
}
