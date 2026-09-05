import {
  HttpErrorResponse,
  HttpRequest,
  HttpHandlerFn,
  HttpEvent
} from '@angular/common/http';
import {inject} from '@angular/core';
import {catchError, Observable, switchMap, throwError} from 'rxjs';
import {AuthService} from '../services/auth.service';

/** Endpoints that mint tokens — never refresh around them. */
const TOKEN_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/complete-new-password'];

function attachTokens(request: HttpRequest<unknown>): HttpRequest<unknown> {
  const accessToken = sessionStorage.getItem('accessToken');
  const idToken = sessionStorage.getItem('idToken');
  if (!accessToken) {
    return request;
  }
  return request.clone({
    // set (not append): a retried/re-cloned request must not accumulate
    // duplicate auth headers.
    headers: request.headers
      .set('Authorization', 'Bearer ' + accessToken)
      .set('X-ID-Token', idToken ? idToken : '')
  });
}

/**
 * Attaches the Cognito tokens, and keeps the session alive: the access token
 * lasts 60 minutes, so a request made near/after expiry first exchanges the
 * refresh token (one shared exchange for concurrent callers), and a 401 that
 * slips through gets one refresh-and-retry before the user is logged out.
 */
export function AuthInterceptor(
  request: HttpRequest<unknown>,
  next: HttpHandlerFn,
): Observable<HttpEvent<unknown>> {
  const authService = inject(AuthService);
  const isTokenEndpoint = TOKEN_ENDPOINTS.some(path => request.url.includes(path));
  if (isTokenEndpoint) {
    return next(attachTokens(request));
  }

  const send = (): Observable<HttpEvent<unknown>> => next(attachTokens(request));
  const initial$ = authService.needsRefresh()
    ? authService.refreshSession().pipe(switchMap(() => send()))
    : send();

  return initial$.pipe(
    catchError((error: unknown) => {
      const status = error instanceof HttpErrorResponse ? error.status : 0;
      if (status !== 401 || !authService.hasStoredSession()) {
        return throwError(() => error);
      }
      // Expired mid-flight (or clock skew): refresh once and retry; a dead
      // refresh token ends the session instead of looping.
      return authService.refreshSession().pipe(
        switchMap(ok => {
          if (ok) {
            return send();
          }
          authService.logout();
          return throwError(() => error);
        }),
      );
    }),
  );
}
