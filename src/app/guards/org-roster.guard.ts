import {inject, Injectable} from '@angular/core';
import {CanActivate, Router, UrlTree} from '@angular/router';
import {AuthService} from '../services/auth.service';

/**
 * The organization-wide Student Roster at /roster/all is the Head Tutor's
 * (client 2026-11-09). Admins already have it at /roster; everyone else
 * lands on their own roster. The service refuses the listing to anyone
 * but admins and the Head Tutor anyway.
 */
@Injectable({
  providedIn: 'root'
})
export class OrgRosterGuard implements CanActivate {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);

  canActivate(): boolean | UrlTree {
    if (this.authService.isHeadTutor() && !this.authService.isAdmin()) {
      return true;
    }
    return this.router.createUrlTree(['/roster']);
  }
}
