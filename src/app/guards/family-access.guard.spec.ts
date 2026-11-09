import { TestBed } from '@angular/core/testing';
import { convertToParamMap, Router, UrlTree } from '@angular/router';
import { FamilyAccessGuard } from './family-access.guard';
import { AuthService } from '../services/auth.service';

describe('FamilyAccessGuard', () => {
  let guard: FamilyAccessGuard;
  let isAdmin: boolean;
  let isSupportStaff: boolean;
  let isTutorLike: boolean;
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };
  const route = (id: string | null) => ({ paramMap: convertToParamMap(id ? { id } : {}) }) as never;

  beforeEach(() => {
    isAdmin = false;
    isSupportStaff = false;
    isTutorLike = true;
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        FamilyAccessGuard,
        {
          provide: AuthService,
          useValue: {
            isAdmin: () => isAdmin,
            isSupportStaff: () => isSupportStaff,
            isTutorLike: () => isTutorLike,
          },
        },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(FamilyAccessGuard);
  });

  it('lets tutors and leads through', () => {
    expect(guard.canActivate(route('fam-1'), {} as never)).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('sends admins to the full contact page of the same family', () => {
    isAdmin = true;
    expect(guard.canActivate(route('fam-1'), {} as never)).toBe(urlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/contacts', 'fam-1']);
    guard.canActivate(route(null), {} as never);
    expect(router.createUrlTree).toHaveBeenLastCalledWith(['/contacts', '']);
  });

  it('sends support staff and groupless users to the calendar', () => {
    isSupportStaff = true;
    expect(guard.canActivate(route('fam-1'), {} as never)).toBe(urlTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/calendar']);
    isSupportStaff = false;
    isTutorLike = false;
    guard.canActivate(route('fam-1'), {} as never);
    expect(router.createUrlTree).toHaveBeenCalledTimes(2);
  });
});
