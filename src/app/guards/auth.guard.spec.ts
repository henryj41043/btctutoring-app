import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('AuthGuard', () => {
  let guard: AuthGuard;
  let loggedIn: boolean;
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };

  beforeEach(() => {
    loggedIn = false;
    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: AuthService, useValue: { loggedIn: () => loggedIn } },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  it('allows activation when logged in', () => {
    loggedIn = true;
    expect(guard.canActivate({} as never, {} as never)).toBe(true);
  });

  it('redirects to /login when not logged in', () => {
    loggedIn = false;
    const result = guard.canActivate({} as never, {} as never);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toBe(urlTree);
  });
});
