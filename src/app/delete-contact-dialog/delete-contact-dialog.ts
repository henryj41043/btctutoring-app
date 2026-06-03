import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatIconModule} from '@angular/material/icon';
import {catchError, EMPTY, switchMap} from 'rxjs';
import {Contact} from '../models/contact.model';
import {ContactService} from '../services/contact.service';
import {AuthService} from '../services/auth.service';

@Component({
  selector: 'app-delete-contact-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './delete-contact-dialog.html',
  styleUrl: './delete-contact-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class DeleteContactDialog {
  readonly contact = inject<Contact>(MAT_DIALOG_DATA);
  private contactService = inject(ContactService);
  private authService = inject(AuthService);
  private dialogRef = inject(MatDialogRef<DeleteContactDialog>);
  private cdr = inject(ChangeDetectorRef);

  protected deleting = false;
  protected error: string | null = null;

  /** True when the contact being deleted is the currently logged-in user. */
  protected readonly isSelf = this.contact.id === this.authService.contact().id;

  confirm(): void {
    this.deleting = true;
    this.error = null;
    this.cdr.markForCheck();

    // If this contact has a Cognito account, delete it first.
    // Only proceed to delete the contact record if Cognito deletion succeeds.
    const delete$ = this.contact.user_profile_created
      ? this.contactService.adminDeleteUser(this.contact.email!).pipe(
          switchMap(response => {
            if (response?.message !== 'Deleted user successfully.') {
              throw new Error('Failed to delete user account.');
            }
            return this.contactService.deleteContact(this.contact.id!);
          })
        )
      : this.contactService.deleteContact(this.contact.id!);

    delete$.pipe(
      catchError(() => {
        this.error = this.contact.user_profile_created
          ? 'Failed to delete the user account. The contact was not deleted.'
          : 'Failed to delete the contact. Please try again.';
        this.deleting = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(() => {
      this.dialogRef.close(true);
    });
  }
}
