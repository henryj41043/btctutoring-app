import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatToolbarModule} from '@angular/material/toolbar';
import {NgOptimizedImage} from '@angular/common';
import {MatMenuModule} from '@angular/material/menu';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatDialog} from '@angular/material/dialog';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../services/auth.service';
import {Router} from '@angular/router';
import {ChangePasswordDialog} from '../change-password-dialog/change-password-dialog';

@Component({
  selector: 'app-tool-bar',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, NgOptimizedImage, MatMenuModule, MatFormFieldModule, FormsModule],
  templateUrl: './tool-bar.html',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './tool-bar.scss'
})
export class ToolBar {
  authService: AuthService = inject(AuthService);
  router: Router = inject(Router);
  private dialog: MatDialog = inject(MatDialog);

  logout(): void {
    this.authService.logout();
  }

  openChangePassword(): void {
    this.dialog.open(ChangePasswordDialog);
  }

  calendarNav(): void {
    void this.router.navigate(['/calendar']);
  }

  sessionsNav(): void {
    void this.router.navigate(['/sessions']);
  }

  contactsNav(): void {
    void this.router.navigate(['/contacts']);
  }

  rosterNav(): void {
    void this.router.navigate(['/roster']);
  }

  payrollNav(): void {
    void this.router.navigate(['/payroll']);
  }
}
