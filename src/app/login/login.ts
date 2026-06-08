import {ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, inject} from '@angular/core';
import {MatButton} from "@angular/material/button";
import {MatCard, MatCardContent} from "@angular/material/card";
import {MatFormFieldModule} from '@angular/material/form-field';
import {FormsModule} from '@angular/forms';
import {MatInput} from '@angular/material/input';
import {MatIconModule} from '@angular/material/icon';
import {AuthService} from '../services/auth.service';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY} from 'rxjs';

type LoginMode = 'login' | 'forgot' | 'reset';

@Component({
  selector: 'app-login',
  imports: [
    MatButton,
    MatCard,
    MatCardContent,
    FormsModule,
    MatFormFieldModule,
    MatInput,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './login.html',
  standalone: true,
  styleUrl: './login.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Login {
  authService: AuthService = inject(AuthService);
  email: string = '';
  password: string = '';
  loggingIn: boolean = false;

  // Forgot-password flow
  mode: LoginMode = 'login';
  resetCode: string = '';
  newPassword: string = '';
  confirmPassword: string = '';
  working: boolean = false;
  forgotError: string = '';
  infoMessage: string = '';

  constructor(private cdr: ChangeDetectorRef) {
    effect(() => {
      if(this.authService.hasError()) {
        this.handleLoginError();
      }
    });
    effect(() => {
      if(this.authService.resetPassword()) {
        this.handleResetPassword();
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

  handleResetPassword() {
    this.loggingIn = false;
    this.password = '';
    this.cdr.markForCheck();
  }

  // ── Forgot password ────────────────────────────────────────────────
  showForgot(): void {
    this.mode = 'forgot';
    this.forgotError = '';
    this.infoMessage = '';
  }

  backToLogin(): void {
    this.mode = 'login';
    this.resetCode = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.forgotError = '';
    this.working = false;
  }

  sendResetCode(): void {
    this.forgotError = '';
    if (!this.email) {
      this.forgotError = 'Please enter your email address.';
      return;
    }
    this.working = true;
    this.authService.forgotPassword(this.email)
      .pipe(catchError(() => {
        this.forgotError = 'Request failed. Please try again.';
        this.working = false;
        this.cdr.markForCheck();
        return EMPTY;
      }))
      .subscribe((response: any) => {
        this.working = false;
        if (response?.success) {
          this.mode = 'reset';
          this.infoMessage = response.message;
        } else {
          this.forgotError = response?.message ?? 'Request failed. Please try again.';
        }
        this.cdr.markForCheck();
      });
  }

  submitReset(): void {
    this.forgotError = '';
    if (!this.resetCode || !this.newPassword || !this.confirmPassword) {
      this.forgotError = 'Please fill out all fields.';
      return;
    }
    if (this.newPassword.length < 8) {
      this.forgotError = 'New password must be at least 8 characters.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.forgotError = 'New password and confirmation do not match.';
      return;
    }
    this.working = true;
    this.authService.confirmForgotPassword(this.email, this.resetCode, this.newPassword)
      .pipe(catchError(() => {
        this.forgotError = 'Request failed. Please try again.';
        this.working = false;
        this.cdr.markForCheck();
        return EMPTY;
      }))
      .subscribe((response: any) => {
        this.working = false;
        if (response?.success) {
          this.backToLogin();
          this.infoMessage = 'Password reset. Please log in with your new password.';
        } else {
          this.forgotError = response?.message ?? 'Request failed. Please try again.';
        }
        this.cdr.markForCheck();
      });
  }
}
