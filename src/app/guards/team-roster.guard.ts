import {inject, Injectable} from '@angular/core';
import {CanActivate, Router, UrlTree} from '@angular/router';
import {AuthService} from '../services/auth.service';

/**
 * The Team Roster is a Lead Tutor's page (client 2026-11-09). Anyone else
 * lands on their own roster (admins: the Student Roster). The service
 * refuses the team listing to everyone but Lead Tutors anyway.
 */
@Injectable({
  providedIn: 'root'
})
export class TeamRosterGuard implements CanActivate {
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);

  canActivate(): boolean | UrlTree {
    if (this.authService.isLead() && !this.authService.isAdmin()) {
      return true;
    }
    return this.router.createUrlTree(['/roster']);
  }
}
