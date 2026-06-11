import { HttpHandlerFn, HttpRequest } from '@angular/common/http';
import { of } from 'rxjs';
import { AuthInterceptor } from './auth.interceptor';

describe('AuthInterceptor', () => {
  let next: jest.MockedFunction<HttpHandlerFn>;

  beforeEach(() => {
    sessionStorage.clear();
    next = jest.fn().mockReturnValue(of({} as never));
  });

  it('passes the request through unchanged when there is no access token', () => {
    const request = new HttpRequest('GET', '/api/data');
    AuthInterceptor(request, next);

    const forwarded = next.mock.calls[0][0];
    expect(forwarded).toBe(request);
    expect(forwarded.headers.has('Authorization')).toBe(false);
  });

  it('attaches the bearer token and id token when present', () => {
    sessionStorage.setItem('accessToken', 'access-123');
    sessionStorage.setItem('idToken', 'id-456');
    const request = new HttpRequest('GET', '/api/data');

    AuthInterceptor(request, next);

    const forwarded = next.mock.calls[0][0];
    expect(forwarded.headers.get('Authorization')).toBe('Bearer access-123');
    expect(forwarded.headers.get('X-ID-Token')).toBe('id-456');
  });

  it('sends an empty id token header when only the access token exists', () => {
    sessionStorage.setItem('accessToken', 'access-123');
    const request = new HttpRequest('GET', '/api/data');

    AuthInterceptor(request, next);

    const forwarded = next.mock.calls[0][0];
    expect(forwarded.headers.get('Authorization')).toBe('Bearer access-123');
    expect(forwarded.headers.get('X-ID-Token')).toBe('');
  });
});
