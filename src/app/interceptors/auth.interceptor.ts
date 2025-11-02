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
      headers: request.headers
        .append('Authorization', 'Bearer ' + accessToken)
        .append('X-ID-Token', idToken? idToken : '')
    });
    return next(updatedRequest);
  } else {
    return next(request);
  }
}
