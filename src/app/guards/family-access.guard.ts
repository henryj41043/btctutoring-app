import {inject, Injectable} from '@angular/core';
import {ActivatedRouteSnapshot, CanActivate, Router, RouterStateSnapshot, UrlTree} from '@angular/router';
import {AuthService} from '../services/auth.service';

/**
 * The read-only family page is for tutors (client 2026-11-09). Admins have
 * the full contact page and are sent there; Support Staff see no students
 * and land on the calendar. The service enforces who may read which family.
 */
@Injectable({
  providedIn: 'root'
})
export class FamilyAccessGuard implements CanActivate {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);

  canActivate(route: ActivatedRouteSnapshot, _state: RouterStateSnapshot): boolean | UrlTree {
    if (this.authService.isAdmin()) {
      return this.router.createUrlTree(['/contacts', route.paramMap.get('id') ?? '']);
    }
    if (this.authService.isSupportStaff() || !this.authService.isTutorLike()) {
      return this.router.createUrlTree(['/calendar']);
    }
    return true;
  }
}
