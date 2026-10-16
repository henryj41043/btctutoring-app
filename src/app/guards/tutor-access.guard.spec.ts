import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { TutorAccessGuard } from './tutor-access.guard';
import { AuthService } from '../services/auth.service';

describe('TutorAccessGuard', () => {
  let guard: TutorAccessGuard;
  let isSupportStaff: boolean;
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };

  beforeEach(() => {
    isSupportStaff = false;
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        TutorAccessGuard,
        { provide: AuthService, useValue: { isSupportStaff: () => isSupportStaff } },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(TutorAccessGuard);
  });

  it('lets admins and tutors through', () => {
    expect(guard.canActivate({} as never, {} as never)).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('sends support staff to the calendar', () => {
    isSupportStaff = true;
    const result = guard.canActivate({} as never, {} as never);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/calendar']);
    expect(result).toBe(urlTree);
  });
});
