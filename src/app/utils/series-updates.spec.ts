import {HttpErrorResponse} from '@angular/common/http';
import {Observable, of, throwError} from 'rxjs';
import {seriesFailureMessage, updateInOrder} from './series-updates';

const conflict = new HttpErrorResponse({status: 409, error: {message: 'Emily already has a session.'}});

describe('updateInOrder', () => {
  it('runs every request in order and reports them all done', done => {
    const calls: number[] = [];
    updateInOrder([1, 2, 3], n => {
      calls.push(n);
      return of(n);
    }).subscribe(outcome => {
      expect(calls).toEqual([1, 2, 3]);
      expect(outcome).toEqual({done: 3});
      done();
    });
  });

  it('stops at the first refusal and counts what went through', done => {
    const calls: number[] = [];
    updateInOrder([1, 2, 3], (n): Observable<number> => {
      calls.push(n);
      return n === 2 ? throwError(() => conflict) : of(n);
    }).subscribe(outcome => {
      expect(calls).toEqual([1, 2]);
      expect(outcome).toEqual({done: 1, failed: true, error: conflict});
      done();
    });
  });

  it('reports nothing done for an empty list', done => {
    updateInOrder([], () => of(null)).subscribe(outcome => {
      expect(outcome).toEqual({done: 0});
      done();
    });
  });
});

describe('seriesFailureMessage', () => {
  it("shows the service's reason, and how many were already changed", () => {
    expect(seriesFailureMessage({done: 0, failed: true, error: conflict}, 4, 'Failed.')).toBe(
      'Emily already has a session.',
    );
    expect(seriesFailureMessage({done: 2, failed: true, error: conflict}, 4, 'Failed.')).toBe(
      'Emily already has a session. 2 of 4 sessions were already updated; the rest were not changed.',
    );
    expect(seriesFailureMessage({done: 0, failed: true, error: new Error('x')}, 4, 'Failed.')).toBe('Failed.');
  });
});
