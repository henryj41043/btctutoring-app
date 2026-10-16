import {inject, Injectable} from '@angular/core';
import {CanActivate, ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree} from '@angular/router';
import {Observable} from 'rxjs';
import {AuthService} from '../services/auth.service';

/**
 * Keeps Support Staff off the tutoring pages (sessions list, student
 * roster): they log their own hours on the calendar and see nothing of
 * students. Everyone else passes; support staff land on the calendar.
 */
@Injectable({
  providedIn: 'root'
})
export class TutorAccessGuard implements CanActivate {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);

  canActivate(
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    if (!this.authService.isSupportStaff()) {
      return true;
    }
    return this.router.createUrlTree(['/calendar']);
  }
}
