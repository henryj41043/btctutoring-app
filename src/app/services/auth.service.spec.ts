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

    it('marks a tutor (no Admins group) as not admin', () => {
      completeSuccessfulLogin(['Tutors']);
      expect(service.isAdmin()).toBe(false);
      expect(service.loggedIn()).toBe(true);
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
});
