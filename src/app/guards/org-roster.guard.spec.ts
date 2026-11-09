import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { OrgRosterGuard } from './org-roster.guard';
import { AuthService } from '../services/auth.service';

describe('OrgRosterGuard', () => {
  let guard: OrgRosterGuard;
  let isHeadTutor: boolean;
  let isAdmin: boolean;
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };

  beforeEach(() => {
    isHeadTutor = true;
    isAdmin = false;
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        OrgRosterGuard,
        { provide: AuthService, useValue: { isHeadTutor: () => isHeadTutor, isAdmin: () => isAdmin } },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(OrgRosterGuard);
  });

  it('lets the Head Tutor through', () => {
    expect(guard.canActivate()).toBe(true);
  });

  it('sends everyone else, admins included, to /roster', () => {
    isHeadTutor = false;
    expect(guard.canActivate()).toBe(urlTree);
    isHeadTutor = true;
    isAdmin = true;
    expect(guard.canActivate()).toBe(urlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/roster']);
  });
});
