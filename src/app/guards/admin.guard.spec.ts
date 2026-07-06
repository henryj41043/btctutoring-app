import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { AdminGuard } from './admin.guard';
import { AuthService } from '../services/auth.service';

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let isAdmin: boolean;
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };

  beforeEach(() => {
    isAdmin = false;
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        AdminGuard,
        { provide: AuthService, useValue: { isAdmin: () => isAdmin } },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(AdminGuard);
  });

  it('allows admins through', () => {
    isAdmin = true;
    expect(guard.canActivate({} as never, {} as never)).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects non-admins to the calendar', () => {
    const result = guard.canActivate({} as never, {} as never);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/calendar']);
    expect(result).toBe(urlTree);
  });
});
