import {
  HttpRequest,
  HttpHandlerFn,
  HttpEvent
} from '@angular/common/http';
import { Observable } from 'rxjs';

export function AuthInterceptor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const accessToken = sessionStorage.getItem('accessToken');
  const idToken = sessionStorage.getItem('idToken');

  if (accessToken) {
    const updatedRequest = request.clone({
      // set (not append): a retried/re-cloned request must not accumulate
      // duplicate auth headers.
      headers: request.headers
        .set('Authorization', 'Bearer ' + accessToken)
        .set('X-ID-Token', idToken? idToken : '')
    });
    return next(updatedRequest);
  } else {
    return next(request);
  }
}
