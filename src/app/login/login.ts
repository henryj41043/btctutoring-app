import {Component, inject} from '@angular/core';
import {MatButton} from "@angular/material/button";
import {MatCard, MatCardActions, MatCardContent, MatCardHeader, MatCardTitle} from "@angular/material/card";
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {MatInput} from '@angular/material/input';
import {AuthService} from '../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [
    MatButton,
    MatCard,
    MatCardActions,
    MatCardContent,
    MatCardHeader,
    MatCardTitle,
    FormsModule,
    MatFormFieldModule,
    MatInput,
  ],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {
  authService: AuthService = inject(AuthService);
  email: string = '';
  password: string = '';

  login() {
    console.log('in login');
    this.authService.login(this.email, this.password);
  }
}
