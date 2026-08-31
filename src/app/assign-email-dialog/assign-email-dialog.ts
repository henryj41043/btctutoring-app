import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject} from '@angular/core';
import {FormsModule} from '@angular/forms';
import {MAT_DIALOG_DATA, MatDialogModule, MatDialogRef} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY} from 'rxjs';
import {EmailService} from '../services/email.service';
import {EmailEntry} from '../models/email-entry.model';
import {Contact} from '../models/contact.model';
import {contactDisplayName} from '../utils/contact-name';
import {FilterSelect, FilterSelectOption} from '../filter-select/filter-select';

export type AssignEmailDialogMode = 'assign' | 'discard';

export interface AssignEmailDialogData {
  mode: AssignEmailDialogMode;
  entry: EmailEntry;
  /** For assign mode: the pickable contacts (summary records). */
  contacts: Contact[];
}

/**
 * Resolves an unmatched email: assign files it onto a chosen contact,
 * discard removes it from the queue (the row is kept server-side so the
 * same content can't resurface). Performs the API call itself and closes
 * with true so the page reloads — the reminder-dialog convention.
 */
@Component({
  selector: 'app-assign-email-dialog',
  imports: [
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    FilterSelect,
  ],
  templateUrl: './assign-email-dialog.html',
  styleUrl: './assign-email-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class AssignEmailDialog {
  protected data: AssignEmailDialogData = inject(MAT_DIALOG_DATA);
  private dialogRef: MatDialogRef<AssignEmailDialog> = inject(MatDialogRef);
  private emailService: EmailService = inject(EmailService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);

  protected selectedContactId: string | null = null;
  protected working: boolean = false;
  protected failed: boolean = false;

  /** Contacts sorted by display name for the select. */
  protected get sortedContacts(): Contact[] {
    return [...this.data.contacts].sort((a, b) =>
      this.contactName(a).localeCompare(this.contactName(b)));
  }

  /** Type-to-filter options (1000+ contacts scroll poorly in a plain select). */
  protected get contactOptions(): FilterSelectOption[] {
    return this.sortedContacts
      .filter(c => !!c.id)
      .map(c => ({value: c.id!, label: this.contactName(c)}));
  }

  protected contactName(contact: Contact): string {
    return contactDisplayName(contact);
  }

  confirm(): void {
    if (this.data.mode === 'assign' && !this.selectedContactId) {
      return;
    }
    this.working = true;
    this.failed = false;
    this.cdr.markForCheck();
    const request$ = this.data.mode === 'assign'
      ? this.emailService.assign(this.data.entry.id!, this.selectedContactId!)
      : this.emailService.discard(this.data.entry.id!);
    request$.pipe(
      catchError(error => {
        console.log(error);
        this.working = false;
        this.failed = true;
        this.cdr.markForCheck();
        return EMPTY;
      }),
    ).subscribe(() => {
      this.dialogRef.close(true);
    });
  }

  cancel(): void {
    this.dialogRef.close(false);
  }
}
