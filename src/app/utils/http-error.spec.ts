import {HttpErrorResponse} from '@angular/common/http';
import {messageOf} from './http-error';

describe('messageOf', () => {
  it("uses the service's message, else the fallback", () => {
    expect(messageOf(new HttpErrorResponse({status: 409, error: {message: 'Booked.'}}), 'Failed.')).toBe('Booked.');
    expect(messageOf(new HttpErrorResponse({status: 500, error: {message: ''}}), 'Failed.')).toBe('Failed.');
    expect(messageOf(new HttpErrorResponse({status: 400, error: {message: ['a']}}), 'Failed.')).toBe('Failed.');
    expect(messageOf(undefined, 'Failed.')).toBe('Failed.');
    expect(messageOf(null, 'Failed.')).toBe('Failed.');
  });
});
