import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatIconModule} from '@angular/material/icon';
import {catchError, EMPTY, forkJoin, of, switchMap} from 'rxjs';
import {Contact} from '../models/contact.model';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {NoteService} from '../services/note.service';
import {DocumentService} from '../services/document.service';
import {AuthService} from '../services/auth.service';
import {contactDisplayName} from '../utils/contact-name';

@Component({
  selector: 'app-delete-contact-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatDialogClose,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './delete-contact-dialog.html',
  styleUrl: './delete-contact-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class DeleteContactDialog implements OnInit {
  readonly contact = inject<Contact>(MAT_DIALOG_DATA);
  private contactService = inject(ContactService);
  private studentService = inject(StudentService);
  private noteService = inject(NoteService);
  private documentService = inject(DocumentService);
  private authService = inject(AuthService);
  private dialogRef = inject(MatDialogRef<DeleteContactDialog>);
  private cdr = inject(ChangeDetectorRef);

  protected deleting = false;
  protected error: string | null = null;
  /** How many uploaded documents go with the contact (shown in the warning). */
  protected documentCount = 0;

  /** Name-less (newsletter) contacts read as their email address. */
  protected readonly displayName = contactDisplayName(this.contact);

  /** True when the contact being deleted is the currently logged-in user. */
  protected readonly isSelf = this.contact.id === this.authService.contact().id;

  ngOnInit(): void {
    if (this.isSelf || !this.contact.id) {
      return;
    }
    // Only for the warning text: a failed count never blocks the delete.
    this.documentService.getDocumentsForContact(this.contact.id).pipe(
      catchError(() => EMPTY),
    ).subscribe(documents => {
      this.documentCount = documents.length;
      this.cdr.markForCheck();
    });
  }

  confirm(): void {
    this.deleting = true;
    this.error = null;
    this.cdr.markForCheck();

    // Step 1: Delete Cognito account first (if the contact has one).
    const cognitoDelete$ = this.contact.user_profile_created
      ? this.contactService.adminDeleteUser(this.contact.email!).pipe(
          switchMap(response => {
            if (response?.message !== 'Deleted user successfully.') {
              throw new Error('Failed to delete user account.');
            }
            return of(null);
          })
        )
      : of(null);

    // Step 2 → 3 → 4: Delete students, notes and documents in parallel, then
    // delete the contact.
    cognitoDelete$.pipe(
      switchMap(() => {
        const students$ = this.studentService.getStudentsByContact(this.contact.id!).pipe(
          switchMap(students =>
            students.length > 0
              ? forkJoin(students.map(s => this.studentService.deleteStudent(s.id!)))
              : of([])
          )
        );
        const notes$ = this.noteService.getNotesByRecipient(this.contact.id!).pipe(
          switchMap(notes =>
            notes.length > 0
              ? forkJoin(notes.map(n => this.noteService.deleteNote(n.id!)))
              : of([])
          )
        );
        const documents$ = this.documentService.deleteForContact(this.contact.id!);
        return forkJoin([students$, notes$, documents$]);
      }),
      switchMap(() => this.contactService.deleteContact(this.contact.id!)),
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
