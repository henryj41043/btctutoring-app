import {inject, Injectable} from '@angular/core';
import { CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import {AuthService} from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  authService: AuthService = inject(AuthService);
  router: Router = inject(Router);

  canActivate(
    _route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {
    if (this.authService.loggedIn()) {
      return true;
    }
    // A page reload wipes the in-memory login but not this tab's tokens —
    // rebuild the session instead of bouncing the user to the login page.
    if (this.authService.hasStoredSession()) {
      return this.authService.restoreSession().pipe(
        map(ok => (ok ? true : this.router.createUrlTree(['/login']))),
      );
    }
    return this.router.createUrlTree(['/login']);
  }
}
