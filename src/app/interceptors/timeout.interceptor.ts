import {
  HttpRequest,
  HttpHandlerFn,
  HttpEvent
} from '@angular/common/http';
import { Observable, timeout } from 'rxjs';

/** No request may hang the UI indefinitely; a TimeoutError hits the caller's catchError. */
export const HTTP_TIMEOUT_MS = 30_000;

export function TimeoutInterceptor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  return next(request).pipe(timeout(HTTP_TIMEOUT_MS));
}
