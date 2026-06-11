import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialogRef } from '@angular/material/dialog';
import { ChangePasswordDialog } from './change-password-dialog';
import { AuthService } from '../services/auth.service';

describe('ChangePasswordDialog', () => {
  const dialogRef = { close: jest.fn() };
  const authService = { changePassword: jest.fn() };
  let component: ChangePasswordDialog;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ChangePasswordDialog],
      providers: [
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: AuthService, useValue: authService },
      ],
    });
    component = TestBed.createComponent(ChangePasswordDialog).componentInstance;
  });

  const fill = (current: string, next: string, confirm: string) => {
    component.currentPassword = current;
    component.newPassword = next;
    component.confirmPassword = confirm;
  };

  it('requires all fields', () => {
    fill('', '', '');
    component.submit();
    expect(component.error).toBe('Please fill out all fields.');
    expect(authService.changePassword).not.toHaveBeenCalled();
  });

  it('requires a minimum new-password length', () => {
    fill('Old1!', 'short', 'short');
    component.submit();
    expect(component.error).toBe('New password must be at least 8 characters.');
  });

  it('requires the confirmation to match', () => {
    fill('Old1!', 'LongEnough1', 'Different1');
    component.submit();
    expect(component.error).toBe('New password and confirmation do not match.');
  });

  it('requires the new password to differ from the current one', () => {
    fill('SamePass123', 'SamePass123', 'SamePass123');
    component.submit();
    expect(component.error).toBe(
      'New password must be different from the current password.',
    );
  });

  it('closes with true on a successful change', () => {
    fill('Old1!pass', 'NewPass123', 'NewPass123');
    authService.changePassword.mockReturnValue(of({ success: true }));
    component.submit();
    expect(authService.changePassword).toHaveBeenCalledWith('Old1!pass', 'NewPass123');
    expect(dialogRef.close).toHaveBeenCalledWith(true);
    expect(component.submitting).toBe(false);
  });

  it('surfaces the server message on an unsuccessful change', () => {
    fill('Old1!pass', 'NewPass123', 'NewPass123');
    authService.changePassword.mockReturnValue(
      of({ success: false, message: 'Current password is incorrect.' }),
    );
    component.submit();
    expect(component.error).toBe('Current password is incorrect.');
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('falls back to a generic message when the response has none', () => {
    fill('Old1!pass', 'NewPass123', 'NewPass123');
    authService.changePassword.mockReturnValue(of({ success: false }));
    component.submit();
    expect(component.error).toBe('Request failed. Please try again.');
  });

  it('handles a failed request', () => {
    fill('Old1!pass', 'NewPass123', 'NewPass123');
    authService.changePassword.mockReturnValue(
      throwError(() => new Error('network')),
    );
    component.submit();
    expect(component.error).toBe('Request failed. Please try again.');
    expect(component.submitting).toBe(false);
  });

  it('cancel closes with false', () => {
    component.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });
});
