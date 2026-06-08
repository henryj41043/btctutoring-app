import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MatButtonModule} from '@angular/material/button';
import {MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatIconModule} from '@angular/material/icon';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY} from 'rxjs';
import {AuthService} from '../services/auth.service';

@Component({
  selector: 'app-change-password-dialog',
  standalone: true,
  imports: [
    FormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './change-password-dialog.html',
  styleUrl: './change-password-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePasswordDialog {
  private authService: AuthService = inject(AuthService);
  private dialogRef: MatDialogRef<ChangePasswordDialog> = inject(MatDialogRef<ChangePasswordDialog>);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  currentPassword: string = '';
  newPassword: string = '';
  confirmPassword: string = '';
  hideCurrent: boolean = true;
  hideNew: boolean = true;
  submitting: boolean = false;
  error: string = '';

  submit(): void {
    this.error = '';

    if (!this.currentPassword || !this.newPassword || !this.confirmPassword) {
      this.error = 'Please fill out all fields.';
      return;
    }
    if (this.newPassword.length < 8) {
      this.error = 'New password must be at least 8 characters.';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.error = 'New password and confirmation do not match.';
      return;
    }
    if (this.newPassword === this.currentPassword) {
      this.error = 'New password must be different from the current password.';
      return;
    }

    this.submitting = true;
    this.authService.changePassword(this.currentPassword, this.newPassword)
      .pipe(catchError(() => {
        this.error = 'Request failed. Please try again.';
        this.submitting = false;
        this.cdr.markForCheck();
        return EMPTY;
      }))
      .subscribe((response: any) => {
        this.submitting = false;
        if (response?.success) {
          this.dialogRef.close(true);
        } else {
          this.error = response?.message ?? 'Request failed. Please try again.';
          this.cdr.markForCheck();
        }
      });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
