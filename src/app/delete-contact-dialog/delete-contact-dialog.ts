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
import {catchError, EMPTY, forkJoin, map, Observable, of, switchMap} from 'rxjs';
import {Contact} from '../models/contact.model';
import {ContactService} from '../services/contact.service';
import {StudentService} from '../services/student.service';
import {NoteService} from '../services/note.service';
import {DocumentService} from '../services/document.service';
import {EmailService} from '../services/email.service';
import {ReminderService} from '../services/reminder.service';
import {ScholarshipService} from '../services/scholarship.service';
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
  private emailService = inject(EmailService);
  private reminderService = inject(ReminderService);
  private scholarshipService = inject(ScholarshipService);
  private authService = inject(AuthService);
  private dialogRef = inject(MatDialogRef<DeleteContactDialog>);
  private cdr = inject(ChangeDetectorRef);

  protected deleting = false;
  protected error: string | null = null;
  /** What else goes with the contact, by kind (shown in the warning). */
  protected counts = {documents: 0, emails: 0, reminders: 0, scholarships: 0};

  /** Name-less (newsletter) contacts read as their email address. */
  protected readonly displayName = contactDisplayName(this.contact);

  /** True when the contact being deleted is the currently logged-in user. */
  protected readonly isSelf = this.contact.id === this.authService.contact().id;

  ngOnInit(): void {
    if (this.isSelf || !this.contact.id) {
      return;
    }
    // Only for the warning text: a failed count reads as zero and never
    // blocks the delete.
    const id = this.contact.id;
    const count = <T>(source: Observable<T[]>, keep: (item: T) => boolean = () => true): Observable<number> =>
      source.pipe(map(items => (items ?? []).filter(keep).length), catchError(() => of(0)));
    forkJoin({
      documents: count(this.documentService.getDocumentsForContact(id)),
      emails: count(this.emailService.getEmailsForContact(id)),
      reminders: count(this.reminderService.getReminders(), reminder => reminder.contact_id === id),
      scholarships: count(this.scholarshipService.getScholarshipRecordsByContact(id)),
    }).subscribe(counts => {
      this.counts = counts;
      this.cdr.markForCheck();
    });
  }

  /** "This contact has 2 documents, 3 filed emails and 1 reminder." ('' when none). */
  protected get countsText(): string {
    const parts = [
      plural(this.counts.documents, 'document'),
      plural(this.counts.emails, 'filed email'),
      plural(this.counts.reminders, 'reminder'),
      plural(this.counts.scholarships, 'scholarship record'),
    ].filter(part => !!part);
    if (parts.length === 0) {
      return '';
    }
    const last = parts.pop();
    return `This contact has ${parts.length > 0 ? `${parts.join(', ')} and ${last}` : last}.`;
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

    // Step 2 → 3 → 4: Delete students, notes, documents, reminders and
    // scholarship records in parallel and remove the filed emails, then
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
        const id = this.contact.id!;
        return forkJoin([
          students$,
          notes$,
          this.documentService.deleteForContact(id),
          this.emailService.discardForContact(id),
          this.reminderService.deleteForContact(id),
          this.scholarshipService.deleteForContact(id),
        ]);
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

/** "3 documents", "1 reminder", '' for none. */
function plural(count: number, noun: string): string {
  return count > 0 ? `${count} ${noun}${count === 1 ? '' : 's'}` : '';
}
