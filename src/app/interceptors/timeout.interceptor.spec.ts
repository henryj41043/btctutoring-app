import { HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { NEVER, of } from 'rxjs';
import { TestScheduler } from 'rxjs/testing';
import { HTTP_TIMEOUT_MS, TimeoutInterceptor } from './timeout.interceptor';

describe('TimeoutInterceptor', () => {
  const request = new HttpRequest('GET', '/api/data');

  it('passes responses through untouched', done => {
    const response = new HttpResponse({ body: 'ok' });
    const next: HttpHandlerFn = jest.fn().mockReturnValue(of(response));

    TimeoutInterceptor(request, next).subscribe(event => {
      expect(event).toBe(response);
      done();
    });
  });

  it('errors with a timeout once the limit elapses on a hung request', () => {
    const scheduler = new TestScheduler((actual, expected) =>
      expect(actual).toEqual(expected),
    );
    scheduler.run(({ expectObservable }) => {
      const next: HttpHandlerFn = jest.fn().mockReturnValue(NEVER);
      expectObservable(TimeoutInterceptor(request, next)).toBe(
        `${HTTP_TIMEOUT_MS}ms #`,
        undefined,
        expect.objectContaining({ name: 'TimeoutError' }),
      );
    });
  });
});
