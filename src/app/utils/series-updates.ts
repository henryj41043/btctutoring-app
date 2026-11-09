import {catchError, concatMap, defer, endWith, from, ignoreElements, map, Observable, of, tap} from 'rxjs';
import {messageOf} from './http-error';

/** How far an in-order run of requests got, and the refusal that stopped it. */
export interface InOrderOutcome {
  done: number;
  failed?: true;
  error?: unknown;
}

/**
 * Sends one request per item, one after the other, and stops at the first
 * refusal. A series edit is checked session by session (a 409 when one would
 * double-book), so going in order means the occurrences after a clash are
 * left as they were instead of racing ahead in parallel.
 */
export function updateInOrder<T>(items: T[], call: (item: T) => Observable<unknown>): Observable<InOrderOutcome> {
  return defer(() => {
    let done = 0;
    return from(items).pipe(
      concatMap(item => call(item).pipe(tap({complete: () => done++}))),
      ignoreElements(),
      endWith(null),
      map((): InOrderOutcome => ({done})),
      catchError(error => of<InOrderOutcome>({done, failed: true, error})),
    );
  });
}

/** The dialog message for a series edit that stopped part way. */
export function seriesFailureMessage(outcome: InOrderOutcome, total: number, fallback: string): string {
  const message = messageOf(outcome.error, fallback);
  if (outcome.done === 0) return message;
  return `${message} ${outcome.done} of ${total} sessions were already updated; the rest were not changed.`;
}
