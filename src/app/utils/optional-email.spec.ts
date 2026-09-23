import {FormControl} from '@angular/forms';
import {optionalEmailValidator} from './optional-email';

describe('optionalEmailValidator', () => {
  const errors = (value: unknown) => optionalEmailValidator(new FormControl(value));

  it('accepts blank, whitespace-only and null values', () => {
    expect(errors('')).toBeNull();
    expect(errors('   ')).toBeNull();
    expect(errors(null)).toBeNull();
    expect(errors(undefined)).toBeNull();
  });

  it('accepts a valid address and rejects a malformed one', () => {
    expect(errors('ada@example.com')).toBeNull();
    expect(errors('not-an-email')).toEqual({email: true});
  });
});
