import {ChangeDetectionStrategy, Component, inject} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatToolbarModule} from '@angular/material/toolbar';
import {NgOptimizedImage} from '@angular/common';
import {MatMenuModule} from '@angular/material/menu';
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {AuthService} from '../services/auth.service';
import {Router} from '@angular/router';

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

  logout(): void {
    this.authService.logout();
  }

  calendarNav(): void {
    this.router.navigate(['/calendar']);
  }

  sessionsNav(): void {
    this.router.navigate(['/sessions']);
  }

  clientsNav(): void {
    console.log('Clients Nav');
  }
}
