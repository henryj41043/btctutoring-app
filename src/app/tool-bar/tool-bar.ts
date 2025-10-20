import {Component, inject, ViewChild} from '@angular/core';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatToolbarModule} from '@angular/material/toolbar';
import {NgIf, NgOptimizedImage} from '@angular/common';
import {MatMenuModule, MatMenuTrigger} from '@angular/material/menu';
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {MatInput} from '@angular/material/input';
import {AuthService} from '../services/auth.service';
import {catchError} from 'rxjs';

@Component({
  selector: 'app-tool-bar',
  imports: [MatToolbarModule, MatButtonModule, MatIconModule, NgOptimizedImage, MatMenuModule, MatFormFieldModule, FormsModule, MatInput, NgIf],
  templateUrl: './tool-bar.html',
  styleUrl: './tool-bar.scss'
})
export class ToolBar {
  @ViewChild('menuTrigger') menuTrigger!: MatMenuTrigger;
  authService: AuthService = inject(AuthService);
  email: string = '';
  password: string = '';
  loggedIn: boolean = false;
  user: any;

  login() {
    console.log('Attempting login with:', this.email, this.password);
    this.authService.login(this.email, this.password)
      .pipe(
        catchError( (error: any): any => {
          console.log(error);
        })
      )
      .subscribe((response) => {
        // TODO: store tokens somewhere safer than session storage
        sessionStorage.setItem('accessToken', response.accessToken);
        sessionStorage.setItem('idToken', response.idToken);
        this.loggedIn = true;
        this.menuTrigger.closeMenu();
        this.getUser();
      });
  }

  getUser() {
    this.authService.getUser()
      .pipe(catchError( (error: any): any => {console.log(error)}))
      .subscribe((response) => {
        this.user = response;
        console.log(this.user);
      });
  }
}
