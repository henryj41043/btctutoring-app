import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { TeamRosterGuard } from './team-roster.guard';
import { AuthService } from '../services/auth.service';

describe('TeamRosterGuard', () => {
  let guard: TeamRosterGuard;
  let isLead: boolean;
  let isAdmin: boolean;
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };

  beforeEach(() => {
    isLead = true;
    isAdmin = false;
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        TeamRosterGuard,
        { provide: AuthService, useValue: { isLead: () => isLead, isAdmin: () => isAdmin } },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(TeamRosterGuard);
  });

  it('lets a Lead Tutor through', () => {
    expect(guard.canActivate()).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('sends a plain tutor and an admin to their own roster', () => {
    isLead = false;
    expect(guard.canActivate()).toBe(urlTree);
    isLead = true;
    isAdmin = true;
    expect(guard.canActivate()).toBe(urlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/roster']);
    expect(router.createUrlTree).toHaveBeenCalledTimes(2);
  });
});
