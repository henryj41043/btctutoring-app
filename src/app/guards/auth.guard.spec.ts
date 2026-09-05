import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { Observable, of } from 'rxjs';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let loggedIn: boolean;
  let stored: boolean;
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };
  const authService = {
    loggedIn: () => loggedIn,
    hasStoredSession: () => stored,
    restoreSession: jest.fn(),
  };

  beforeEach(() => {
    loggedIn = false;
    stored = false;
    jest.clearAllMocks();
    router.createUrlTree.mockReturnValue(urlTree);
    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  it('allows activation when logged in', () => {
    loggedIn = true;
    expect(guard.canActivate({} as never, {} as never)).toBe(true);
    expect(authService.restoreSession).not.toHaveBeenCalled();
  });

  it('redirects to /login when not logged in and nothing is stored', () => {
    const result = guard.canActivate({} as never, {} as never);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe(urlTree);
    expect(authService.restoreSession).not.toHaveBeenCalled();
  });

  it('restores a stored session (page reload) and allows activation', done => {
    stored = true;
    authService.restoreSession.mockReturnValue(of(true));
    (guard.canActivate({} as never, {} as never) as Observable<boolean | UrlTree>)
      .subscribe(result => {
        expect(result).toBe(true);
        expect(router.createUrlTree).not.toHaveBeenCalled();
        done();
      });
  });

  it('redirects to /login when the stored session cannot be restored', done => {
    stored = true;
    authService.restoreSession.mockReturnValue(of(false));
    (guard.canActivate({} as never, {} as never) as Observable<boolean | UrlTree>)
      .subscribe(result => {
        expect(result).toBe(urlTree);
        expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
        done();
      });
  });
});
