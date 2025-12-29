import {Component, effect, inject} from '@angular/core';
import {MatButton} from "@angular/material/button";
import {MatCard, MatCardContent, MatCardHeader, MatCardTitle} from "@angular/material/card";
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {MatInput} from '@angular/material/input';
import {AuthService} from '../services/auth.service';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';

@Component({
  selector: 'app-login',
  imports: [
    MatButton,
    MatCard,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    FormsModule,
    MatFormFieldModule,
    MatInput,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  standalone: true,
  styleUrl: './login.scss'
})
export class Login {
  authService: AuthService = inject(AuthService);
  email: string = '';
  password: string = '';
  loggingIn: boolean = false;

  constructor() {
    effect(() => {
      if(this.authService.hasError()) {
        this.handleLoginError();
      }
    });
  }

  login() {
    this.loggingIn = true;
    this.authService.login(this.email, this.password);
  }

  handleLoginError() {
    this.loggingIn = false;
  }
}
