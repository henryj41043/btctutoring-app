import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import { Login } from './login';
import { AuthService } from '../services/auth.service';

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let component: Login;
  const hasError = signal(false);
  const resetPassword = signal(false);
  const authService = {
    hasError,
    resetPassword,
    login: jest.fn(),
    forgotPassword: jest.fn(),
    confirmForgotPassword: jest.fn(),
  };

  beforeEach(() => {
    hasError.set(false);
    resetPassword.set(false);
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideNoopAnimations(),
        { provide: AuthService, useValue: authService },
      ],
    });
    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('login() delegates to the auth service', () => {
    component.email = 'a@b.com';
    component.password = 'pw';
    component.login();
    expect(component.loggingIn).toBe(true);
    expect(authService.login).toHaveBeenCalledWith('a@b.com', 'pw');
  });

  it('reacts to an auth error by stopping the spinner', () => {
    component.loggingIn = true;
    hasError.set(true);
    fixture.detectChanges();
    expect(component.loggingIn).toBe(false);
  });

  it('reacts to a reset-password challenge by clearing the password', () => {
    component.password = 'secret';
    resetPassword.set(true);
    fixture.detectChanges();
    expect(component.password).toBe('');
    expect(component.loggingIn).toBe(false);
  });

  describe('forgot-password flow', () => {
    it('showForgot switches to forgot mode', () => {
      component.showForgot();
      expect(component.mode).toBe('forgot');
    });

    it('backToLogin resets the forgot/reset fields', () => {
      component.mode = 'reset';
      component.resetCode = '123';
      component.newPassword = 'x';
      component.backToLogin();
      expect(component.mode).toBe('login');
      expect(component.resetCode).toBe('');
    });

    it('sendResetCode requires an email', () => {
      component.email = '';
      component.sendResetCode();
      expect(component.forgotError).toBe('Please enter your email address.');
      expect(authService.forgotPassword).not.toHaveBeenCalled();
    });

    it('sendResetCode advances to reset mode on success', () => {
      component.email = 'a@b.com';
      authService.forgotPassword.mockReturnValue(
        of({ success: true, message: 'Code sent.' }),
      );
      component.sendResetCode();
      expect(component.mode).toBe('reset');
      expect(component.infoMessage).toBe('Code sent.');
    });

    it('sendResetCode surfaces a server failure message', () => {
      component.email = 'a@b.com';
      authService.forgotPassword.mockReturnValue(
        of({ success: false, message: 'No such user.' }),
      );
      component.sendResetCode();
      expect(component.forgotError).toBe('No such user.');
    });

    it('sendResetCode falls back to a generic message when none is provided', () => {
      component.email = 'a@b.com';
      authService.forgotPassword.mockReturnValue(of({ success: false }));
      component.sendResetCode();
      expect(component.forgotError).toBe('Request failed. Please try again.');
    });

    it('sendResetCode handles a request error', () => {
      component.email = 'a@b.com';
      authService.forgotPassword.mockReturnValue(
        throwError(() => new Error('network')),
      );
      component.sendResetCode();
      expect(component.forgotError).toBe('Request failed. Please try again.');
      expect(component.working).toBe(false);
    });
  });

  describe('submitReset', () => {
    beforeEach(() => {
      component.email = 'a@b.com';
      component.resetCode = '123';
      component.newPassword = 'NewPass123';
      component.confirmPassword = 'NewPass123';
    });

    it('requires all fields', () => {
      component.resetCode = '';
      component.submitReset();
      expect(component.forgotError).toBe('Please fill out all fields.');
    });

    it('requires a minimum length', () => {
      component.newPassword = 'short';
      component.confirmPassword = 'short';
      component.submitReset();
      expect(component.forgotError).toBe(
        'New password must be at least 8 characters.',
      );
    });

    it('requires the confirmation to match', () => {
      component.confirmPassword = 'Different123';
      component.submitReset();
      expect(component.forgotError).toBe(
        'New password and confirmation do not match.',
      );
    });

    it('returns to login on success', () => {
      authService.confirmForgotPassword.mockReturnValue(of({ success: true }));
      component.submitReset();
      expect(authService.confirmForgotPassword).toHaveBeenCalledWith(
        'a@b.com',
        '123',
        'NewPass123',
      );
      expect(component.mode).toBe('login');
      expect(component.infoMessage).toContain('Password reset');
    });

    it('surfaces a server failure message', () => {
      authService.confirmForgotPassword.mockReturnValue(
        of({ success: false, message: 'Bad code.' }),
      );
      component.submitReset();
      expect(component.forgotError).toBe('Bad code.');
    });

    it('falls back to a generic message when none is provided', () => {
      authService.confirmForgotPassword.mockReturnValue(of({ success: false }));
      component.submitReset();
      expect(component.forgotError).toBe('Request failed. Please try again.');
    });

    it('handles a request error', () => {
      authService.confirmForgotPassword.mockReturnValue(
        throwError(() => new Error('network')),
      );
      component.submitReset();
      expect(component.forgotError).toBe('Request failed. Please try again.');
    });
  });
});
