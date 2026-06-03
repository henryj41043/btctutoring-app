import {inject, Injectable} from '@angular/core';
import {CanActivate, Router, ActivatedRouteSnapshot, RouterStateSnapshot, UrlTree} from '@angular/router';
import {Observable} from 'rxjs';
import {AuthService} from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class ContactAccessGuard implements CanActivate {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    _state: RouterStateSnapshot): Observable<boolean | UrlTree> | Promise<boolean | UrlTree> | boolean | UrlTree {

    // Admins can access any contact or the contacts table
    if (this.authService.isAdmin()) {
      return true;
    }

    const ownContactId = this.authService.contact().id!;
    const routeId = route.paramMap.get('id');

    // Tutor accessing the contacts table (/contacts) → redirect to their own contact
    if (!routeId) {
      return this.router.createUrlTree(['/contacts', ownContactId]);
    }

    // Tutor accessing someone else's contact page → redirect to their own
    if (routeId !== ownContactId) {
      return this.router.createUrlTree(['/contacts', ownContactId]);
    }

    // Tutor accessing their own contact page → allow
    return true;
  }
}
