import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, UrlTree } from '@angular/router';
import { ContactAccessGuard } from './contact-access.guard';
import { AuthService } from '../services/auth.service';

describe('ContactAccessGuard', () => {
  let guard: ContactAccessGuard;
  let isAdmin: boolean;
  const ownContactId = 'own-contact';
  const urlTree = {} as UrlTree;
  const router = { createUrlTree: jest.fn().mockReturnValue(urlTree) };

  const routeWithId = (id: string | null): ActivatedRouteSnapshot =>
    ({ paramMap: { get: () => id } }) as unknown as ActivatedRouteSnapshot;

  beforeEach(() => {
    isAdmin = false;
    router.createUrlTree.mockClear();
    TestBed.configureTestingModule({
      providers: [
        ContactAccessGuard,
        {
          provide: AuthService,
          useValue: {
            isAdmin: () => isAdmin,
            contact: () => ({ id: ownContactId }),
          },
        },
        { provide: Router, useValue: router },
      ],
    });
    guard = TestBed.inject(ContactAccessGuard);
  });

  it('allows admins to access any contact', () => {
    isAdmin = true;
    expect(guard.canActivate(routeWithId('any'), {} as never)).toBe(true);
  });

  it('redirects a tutor on the contacts table to their own contact', () => {
    const result = guard.canActivate(routeWithId(null), {} as never);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/contacts', ownContactId]);
    expect(result).toBe(urlTree);
  });

  it("redirects a tutor away from someone else's contact", () => {
    const result = guard.canActivate(routeWithId('other-contact'), {} as never);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/contacts', ownContactId]);
    expect(result).toBe(urlTree);
  });

  it('allows a tutor to view their own contact', () => {
    expect(guard.canActivate(routeWithId(ownContactId), {} as never)).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });
});
