import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';

const base = environment.btctutoringServiceUrl;

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let router: { navigate: jest.Mock };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    sessionStorage.clear();
    router = { navigate: jest.fn() };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Drive a full, successful login: /auth/login -> /auth -> /contacts. */
  const completeSuccessfulLogin = (groups: string[] = ['Admins']) => {
    service.login('a@b.com', 'pw');
    httpMock
      .expectOne(`${base}/auth/login`)
      .flush({ AccessToken: 'access', IdToken: 'id' });
    httpMock.expectOne(`${base}/auth`).flush({
      username: 'a@b.com',
      email: 'a@b.com',
      groups,
      contact: 'c-1',
    });
    httpMock
      .expectOne(`${base}/contacts?id=c-1`)
      .flush([{ id: 'c-1', first_name: 'Ada' }]);
  };

  it('should be created with sensible initial state', () => {
    expect(service).toBeTruthy();
    expect(service.loggedIn()).toBe(false);
    expect(service.hasError()).toBe(false);
    expect(service.isAdmin()).toBe(false);
    expect(service.resetPassword()).toBe(false);
  });

  describe('login (normal flow)', () => {
    it('stores tokens, loads the user + contact, and navigates to the calendar', () => {
      completeSuccessfulLogin(['Admins']);

      expect(sessionStorage.getItem('accessToken')).toBe('access');
      expect(sessionStorage.getItem('idToken')).toBe('id');
      expect(service.loggedIn()).toBe(true);
      expect(service.isAdmin()).toBe(true);
      expect(service.user().email).toBe('a@b.com');
      expect(service.contact().id).toBe('c-1');
      expect(router.navigate).toHaveBeenCalledWith(['/calendar']);
    });

    it('errors instead of logging in when the contact record is missing', () => {
      service.login('a@b.com', 'pw');
      httpMock
        .expectOne(`${base}/auth/login`)
        .flush({ AccessToken: 'access', IdToken: 'id' });
      httpMock.expectOne(`${base}/auth`).flush({
        username: 'a@b.com',
        email: 'a@b.com',
        groups: ['Tutors'],
        contact: 'c-gone',
      });
      httpMock.expectOne(`${base}/contacts?id=c-gone`).flush([]);

      expect(service.loggedIn()).toBe(false);
      expect(service.hasError()).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('marks a tutor (no Admins group) as not admin', () => {
      completeSuccessfulLogin(['Tutors']);
      expect(service.isAdmin()).toBe(false);
      expect(service.loggedIn()).toBe(true);
    });

    it.each([
      [['Admins'], false, false],
      [['Tutors'], false, true],
      [['LeadTutors'], true, true],
      [[], false, false],
    ])('groups %j -> isLead %s, isTutorLike %s', (groups, isLead, isTutorLike) => {
      completeSuccessfulLogin(groups as string[]);
      expect(service.isLead()).toBe(isLead);
      expect(service.isTutorLike()).toBe(isTutorLike);
    });

    it('enters reset-password mode when a new password is required', () => {
      service.login('a@b.com', 'pw');
      httpMock
        .expectOne(`${base}/auth/login`)
        .flush({ message: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' });

      expect(sessionStorage.getItem('sessionToken')).toBe('sess-1');
      expect(service.resetPassword()).toBe(true);
      expect(service.loggedIn()).toBe(false);
    });

    it('sets hasError when the login request fails', () => {
      service.login('a@b.com', 'pw');
      const req = httpMock.expectOne(`${base}/auth/login`);
      try {
        req.flush('nope', { status: 500, statusText: 'Server Error' });
      } catch {
        /* the production catchError returns void, breaking the stream */
      }
      expect(service.hasError()).toBe(true);
    });
  });

  describe('login (reset-password flow)', () => {
    it('completes the new-password challenge and logs in', () => {
      // First trigger reset mode.
      service.login('a@b.com', 'pw');
      httpMock
        .expectOne(`${base}/auth/login`)
        .flush({ message: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' });
      expect(service.resetPassword()).toBe(true);

      // Second login submits the new password.
      service.login('a@b.com', 'newPass');
      const challenge = httpMock.expectOne(
        `${base}/auth/complete-new-password`,
      );
      expect(challenge.request.body).toEqual({
        username: 'a@b.com',
        newPassword: 'newPass',
        session: 'sess-1',
      });
      challenge.flush({ AccessToken: 'access', IdToken: 'id' });

      httpMock.expectOne(`${base}/auth`).flush({
        username: 'a@b.com',
        email: 'a@b.com',
        groups: ['Tutors'],
        contact: 'c-1',
      });
      httpMock.expectOne(`${base}/contacts?id=c-1`).flush([{ id: 'c-1' }]);

      expect(service.resetPassword()).toBe(false);
      expect(sessionStorage.getItem('sessionToken')).toBe('');
      expect(service.loggedIn()).toBe(true);
    });

    it('sets hasError when the new-password challenge fails', () => {
      service.login('a@b.com', 'pw');
      httpMock
        .expectOne(`${base}/auth/login`)
        .flush({ message: 'NEW_PASSWORD_REQUIRED', session: 'sess-1' });

      service.login('a@b.com', 'newPass');
      const challenge = httpMock.expectOne(`${base}/auth/complete-new-password`);
      try {
        challenge.flush('nope', { status: 500, statusText: 'Server Error' });
      } catch {
        /* broken catchError stream after the side effect */
      }
      expect(service.hasError()).toBe(true);
    });
  });

  describe('error propagation in the login chain', () => {
    it('sets hasError when loading the user fails', () => {
      service.login('a@b.com', 'pw');
      httpMock
        .expectOne(`${base}/auth/login`)
        .flush({ AccessToken: 'access', IdToken: 'id' });
      const userReq = httpMock.expectOne(`${base}/auth`);
      try {
        userReq.flush('nope', { status: 500, statusText: 'Server Error' });
      } catch {
        /* broken stream after side effect */
      }
      expect(service.hasError()).toBe(true);
    });

    it('sets hasError when loading the contact fails', () => {
      service.login('a@b.com', 'pw');
      httpMock
        .expectOne(`${base}/auth/login`)
        .flush({ AccessToken: 'access', IdToken: 'id' });
      httpMock.expectOne(`${base}/auth`).flush({
        username: 'a@b.com',
        email: 'a@b.com',
        groups: ['Tutors'],
        contact: 'c-1',
      });
      const contactReq = httpMock.expectOne(`${base}/contacts?id=c-1`);
      try {
        contactReq.flush('nope', { status: 500, statusText: 'Server Error' });
      } catch {
        /* broken stream after side effect */
      }
      expect(service.hasError()).toBe(true);
    });
  });

  describe('password endpoints', () => {
    it('changePassword POSTs the password pair', () => {
      service.changePassword('Old1!', 'New1!').subscribe();
      const req = httpMock.expectOne(`${base}/auth/change-password`);
      expect(req.request.body).toEqual({
        previousPassword: 'Old1!',
        proposedPassword: 'New1!',
      });
      req.flush({ success: true });
    });

    it('forgotPassword POSTs the email', () => {
      service.forgotPassword('a@b.com').subscribe();
      const req = httpMock.expectOne(`${base}/auth/forgot-password`);
      expect(req.request.body).toEqual({ email: 'a@b.com' });
      req.flush({ success: true });
    });

    it('confirmForgotPassword POSTs the code and new password', () => {
      service.confirmForgotPassword('a@b.com', '123', 'New1!').subscribe();
      const req = httpMock.expectOne(`${base}/auth/confirm-forgot-password`);
      expect(req.request.body).toEqual({
        email: 'a@b.com',
        code: '123',
        newPassword: 'New1!',
      });
      req.flush({ success: true });
    });
  });

  describe('logout', () => {
    it('clears state and navigates to login when logged in', () => {
      completeSuccessfulLogin();
      router.navigate.mockClear();

      service.logout();

      expect(sessionStorage.getItem('accessToken')).toBe('');
      expect(sessionStorage.getItem('idToken')).toBe('');
      expect(service.loggedIn()).toBe(false);
      expect(service.user().email).toBe('');
      expect(router.navigate).toHaveBeenCalledWith(['/login']);
    });

    it('does nothing when not logged in', () => {
      service.logout();
      expect(router.navigate).not.toHaveBeenCalled();
    });
  });
  describe('session persistence (refresh + restore)', () => {
    /** A structurally valid (unsigned) JWT expiring `secondsFromNow` from now. */
    const jwt = (secondsFromNow: number): string => {
      const exp = Math.floor(Date.now() / 1000) + secondsFromNow;
      return `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;
    };
    /** Tokens as a completed login leaves them in this tab. */
    const seedStoredSession = (accessToken: string) => {
      sessionStorage.setItem('accessToken', accessToken);
      sessionStorage.setItem('idToken', 'id');
      sessionStorage.setItem('refreshToken', 'rt-1');
      sessionStorage.setItem('username', 'cognito-user');
    };

    it('login stores the refresh token and the Cognito username', () => {
      service.login('a@b.com', 'pw');
      httpMock
        .expectOne(`${base}/auth/login`)
        .flush({ AccessToken: 'access', IdToken: 'id', RefreshToken: 'rt-1' });
      httpMock.expectOne(`${base}/auth`).flush({
        username: 'cognito-user', email: 'a@b.com', groups: ['Admins'], contact: 'c-1',
      });
      httpMock.expectOne(`${base}/contacts?id=c-1`).flush([{ id: 'c-1' }]);
      expect(sessionStorage.getItem('refreshToken')).toBe('rt-1');
      expect(sessionStorage.getItem('username')).toBe('cognito-user');
      expect(service.hasStoredSession()).toBe(true);
    });

    it('needsRefresh: only with a stored session AND a near-expiry access token', () => {
      expect(service.needsRefresh()).toBe(false); // nothing stored
      seedStoredSession(jwt(3600));
      expect(service.needsRefresh()).toBe(false); // an hour left
      seedStoredSession(jwt(30));
      expect(service.needsRefresh()).toBe(true); // inside the 90s lead
      seedStoredSession('garbage');
      expect(service.needsRefresh()).toBe(true); // unreadable = refresh
    });

    it('refreshSession exchanges the refresh token and stores the new access/id tokens', () => {
      seedStoredSession(jwt(30));
      const results: boolean[] = [];
      service.refreshSession().subscribe(ok => results.push(ok));
      const req = httpMock.expectOne(`${base}/auth/refresh`);
      expect(req.request.body).toEqual({ username: 'cognito-user', refreshToken: 'rt-1' });
      req.flush({ AccessToken: 'fresh', IdToken: 'fresh-id' });
      expect(results).toEqual([true]);
      expect(sessionStorage.getItem('accessToken')).toBe('fresh');
      expect(sessionStorage.getItem('idToken')).toBe('fresh-id');
      // A refresh response carries no refresh token — the stored one survives.
      expect(sessionStorage.getItem('refreshToken')).toBe('rt-1');
    });

    it('concurrent refresh callers share ONE exchange', () => {
      seedStoredSession(jwt(30));
      const results: boolean[] = [];
      service.refreshSession().subscribe(ok => results.push(ok));
      service.refreshSession().subscribe(ok => results.push(ok));
      httpMock.expectOne(`${base}/auth/refresh`).flush({ AccessToken: 'fresh', IdToken: 'id' });
      expect(results).toEqual([true, true]);
      // After completion a new call starts a fresh exchange.
      service.refreshSession().subscribe();
      httpMock.expectOne(`${base}/auth/refresh`).flush({ AccessToken: 'fresh2', IdToken: 'id' });
    });

    it('a failed or empty refresh discards the refresh token so nothing retries it', () => {
      seedStoredSession(jwt(30));
      let result: boolean | undefined;
      service.refreshSession().subscribe(ok => (result = ok));
      httpMock.expectOne(`${base}/auth/refresh`).flush({ message: 'Refresh failed.' });
      expect(result).toBe(false);
      expect(sessionStorage.getItem('refreshToken')).toBe('');
      expect(service.hasStoredSession()).toBe(false);

      seedStoredSession(jwt(30));
      service.refreshSession().subscribe(ok => (result = ok));
      httpMock.expectOne(`${base}/auth/refresh`).flush('nope', { status: 500, statusText: 'err' });
      expect(result).toBe(false);
      expect(service.hasStoredSession()).toBe(false);
    });

    it('refreshSession without stored credentials is an immediate false', () => {
      let result: boolean | undefined;
      service.refreshSession().subscribe(ok => (result = ok));
      expect(result).toBe(false);
      httpMock.expectNone(`${base}/auth/refresh`);
    });

    it('restoreSession rebuilds the login from a fresh stored token without navigating', () => {
      seedStoredSession(jwt(3600));
      let result: boolean | undefined;
      service.restoreSession().subscribe(ok => (result = ok));
      httpMock.expectNone(`${base}/auth/refresh`);
      httpMock.expectOne(`${base}/auth`).flush({
        username: 'cognito-user', email: 'a@b.com', groups: ['Tutors'], contact: 'c-1',
      });
      httpMock.expectOne(`${base}/contacts?id=c-1`).flush([{ id: 'c-1', first_name: 'Ada' }]);
      expect(result).toBe(true);
      expect(service.loggedIn()).toBe(true);
      expect(service.isTutorLike()).toBe(true);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('restoreSession refreshes a stale token first', () => {
      seedStoredSession(jwt(10));
      let result: boolean | undefined;
      service.restoreSession().subscribe(ok => (result = ok));
      httpMock.expectOne(`${base}/auth/refresh`).flush({ AccessToken: 'fresh', IdToken: 'id' });
      httpMock.expectOne(`${base}/auth`).flush({
        username: 'cognito-user', email: 'a@b.com', groups: ['Admins'], contact: 'c-1',
      });
      httpMock.expectOne(`${base}/contacts?id=c-1`).flush([{ id: 'c-1' }]);
      expect(result).toBe(true);
      expect(service.loggedIn()).toBe(true);
    });

    it('restoreSession is false when nothing is stored, when the refresh fails, or when identity fails', () => {
      const results: boolean[] = [];
      service.restoreSession().subscribe(ok => results.push(ok));
      expect(results).toEqual([false]);

      seedStoredSession(jwt(10));
      service.restoreSession().subscribe(ok => results.push(ok));
      httpMock.expectOne(`${base}/auth/refresh`).flush({ message: 'Refresh failed.' });
      expect(results).toEqual([false, false]);
      httpMock.expectNone(`${base}/auth`);

      seedStoredSession(jwt(3600));
      service.restoreSession().subscribe(ok => results.push(ok));
      httpMock.expectOne(`${base}/auth`).flush('nope', { status: 401, statusText: 'x' });
      expect(results).toEqual([false, false, false]);
      expect(service.loggedIn()).toBe(false);
    });

    it('restoreSession is an immediate true when already logged in', () => {
      completeSuccessfulLogin();
      let result: boolean | undefined;
      service.restoreSession().subscribe(ok => (result = ok));
      expect(result).toBe(true);
      httpMock.expectNone(`${base}/auth`);
    });

    it('logout clears the refresh token and username too', () => {
      completeSuccessfulLogin();
      sessionStorage.setItem('refreshToken', 'rt-1');
      service.logout();
      expect(sessionStorage.getItem('refreshToken')).toBe('');
      expect(sessionStorage.getItem('username')).toBe('');
      expect(service.hasStoredSession()).toBe(false);
    });
  });
});
