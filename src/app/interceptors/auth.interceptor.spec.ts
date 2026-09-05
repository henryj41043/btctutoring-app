import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse, HttpHandlerFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('AuthInterceptor', () => {
  let next: jest.MockedFunction<HttpHandlerFn>;
  let needsRefresh: boolean;
  let stored: boolean;
  const authService = {
    needsRefresh: () => needsRefresh,
    hasStoredSession: () => stored,
    refreshSession: jest.fn(),
    logout: jest.fn(),
  };

  const run = (request: HttpRequest<unknown>) =>
    TestBed.runInInjectionContext(() => AuthInterceptor(request, next));
  const unauthorized = () => new HttpErrorResponse({ status: 401 });

  beforeEach(() => {
    sessionStorage.clear();
    needsRefresh = false;
    stored = false;
    jest.clearAllMocks();
    next = jest.fn().mockReturnValue(of(new HttpResponse({ status: 200 })));
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: authService }],
    });
  });

  it('passes the request through unchanged when there is no access token', () => {
    const request = new HttpRequest('GET', '/api/data');
    run(request).subscribe();
    const forwarded = next.mock.calls[0][0];
    expect(forwarded).toBe(request);
    expect(forwarded.headers.has('Authorization')).toBe(false);
  });

  it('attaches the bearer token and id token when present', () => {
    sessionStorage.setItem('accessToken', 'access-123');
    sessionStorage.setItem('idToken', 'id-456');
    run(new HttpRequest('GET', '/api/data')).subscribe();
    const forwarded = next.mock.calls[0][0];
    expect(forwarded.headers.get('Authorization')).toBe('Bearer access-123');
    expect(forwarded.headers.get('X-ID-Token')).toBe('id-456');
  });

  it('sends an empty id token header when only the access token exists', () => {
    sessionStorage.setItem('accessToken', 'access-123');
    run(new HttpRequest('GET', '/api/data')).subscribe();
    const forwarded = next.mock.calls[0][0];
    expect(forwarded.headers.get('Authorization')).toBe('Bearer access-123');
    expect(forwarded.headers.get('X-ID-Token')).toBe('');
  });

  it('refreshes BEFORE sending when the access token is about to expire, then uses the new token', () => {
    sessionStorage.setItem('accessToken', 'stale');
    needsRefresh = true;
    authService.refreshSession.mockImplementation(() => {
      sessionStorage.setItem('accessToken', 'fresh');
      return of(true);
    });
    run(new HttpRequest('GET', '/api/data')).subscribe();
    expect(authService.refreshSession).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0].headers.get('Authorization')).toBe('Bearer fresh');
  });

  it('never refreshes around the token-minting endpoints themselves', () => {
    needsRefresh = true;
    for (const url of ['/auth/login', '/auth/refresh', '/auth/complete-new-password']) {
      run(new HttpRequest('POST', `https://api.example${url}`, {})).subscribe();
    }
    expect(authService.refreshSession).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(3);
  });

  it('on a 401 with a stored session: refreshes once and retries with the new token', done => {
    sessionStorage.setItem('accessToken', 'stale');
    stored = true;
    next
      .mockReturnValueOnce(throwError(() => unauthorized()))
      .mockReturnValueOnce(of(new HttpResponse({ status: 200 })));
    authService.refreshSession.mockImplementation(() => {
      sessionStorage.setItem('accessToken', 'fresh');
      return of(true);
    });
    run(new HttpRequest('GET', '/api/data')).subscribe(event => {
      expect((event as HttpResponse<unknown>).status).toBe(200);
      expect(next).toHaveBeenCalledTimes(2);
      expect(next.mock.calls[1][0].headers.get('Authorization')).toBe('Bearer fresh');
      expect(authService.logout).not.toHaveBeenCalled();
      done();
    });
  });

  it('on a 401 when the refresh fails: logs out and rethrows (no retry loop)', done => {
    stored = true;
    next.mockReturnValue(throwError(() => unauthorized()));
    authService.refreshSession.mockReturnValue(of(false));
    run(new HttpRequest('GET', '/api/data')).subscribe({
      error: err => {
        expect((err as HttpErrorResponse).status).toBe(401);
        expect(next).toHaveBeenCalledTimes(1);
        expect(authService.logout).toHaveBeenCalledTimes(1);
        done();
      },
    });
  });

  it('a 401 without a stored session, or any non-401 error, is rethrown untouched', done => {
    next.mockReturnValueOnce(throwError(() => unauthorized()));
    run(new HttpRequest('GET', '/api/data')).subscribe({
      error: err => {
        expect((err as HttpErrorResponse).status).toBe(401);
        expect(authService.refreshSession).not.toHaveBeenCalled();
        stored = true;
        next.mockReturnValueOnce(throwError(() => new HttpErrorResponse({ status: 500 })));
        run(new HttpRequest('GET', '/api/data')).subscribe({
          error: err2 => {
            expect((err2 as HttpErrorResponse).status).toBe(500);
            expect(authService.refreshSession).not.toHaveBeenCalled();
            done();
          },
        });
      },
    });
  });
});
