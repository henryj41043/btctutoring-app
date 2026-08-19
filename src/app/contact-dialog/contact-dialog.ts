import {Component, DestroyRef, inject, OnInit} from '@angular/core';
import {
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {HttpErrorResponse} from '@angular/common/http';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {provideNativeDateAdapter} from '@angular/material/core';
import {Service} from '../enums/service.enum';
import {ContactService} from '../services/contact.service';
import {Contact} from '../models/contact.model';
import {PhoneFormatDirective} from '../directives/phone-format.directive';
import {phoneValidator} from '../utils/phone.util';
import {normalizeParentStatus} from '../utils/legacy-status';
import {staffStatusLabel} from '../enums/staff-status.enum';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-contact-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    PhoneFormatDirective,
  ],
  templateUrl: './contact-dialog.html',
  styleUrl: './contact-dialog.scss'
})
export class ContactDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<ContactDialog>);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private contactService: ContactService = inject(ContactService);
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected contactForm: FormGroup = this.formBuilder.group({
    // Optional: newsletter signups arrive with only an email address.
    first_name: [''],
    last_name: [''],
    email: ['', [Validators.required, Validators.email]],
    phone_number: ['', phoneValidator],
    service: [undefined, Validators.required],
  });
  protected serviceOptions: string[] = Object.values(Service);
  protected errorMessage: string = '';
  protected hasError: boolean = false;
  /** Names of existing contacts matching the typed name (possible dupes). */
  protected duplicateMatches: string[] = [];
  /** Armed after the warning shows — the next Create proceeds anyway. */
  private duplicateAcknowledged: boolean = false;
  private existingContacts: Contact[] = [];
  // True while the create request is in flight — swaps the button for a spinner
  // and disables the actions so the user can't submit twice.
  protected submitting: boolean = false;

  cancel(): void {
    if (this.submitting) {
      return;
    }
    this.dialogRef.close();
  }

  ngOnInit(): void {
    // Lean cached summary backs the possible-duplicate name check. Fail-open:
    // if it can't load, creation just proceeds without the warning.
    this.contactService.getContactsSummary().pipe(
      catchError(() => EMPTY),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(contacts => this.existingContacts = contacts);
    // Editing the name re-arms the duplicate check.
    this.contactForm.controls['first_name'].valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetDuplicateWarning());
    this.contactForm.controls['last_name'].valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.resetDuplicateWarning());
  }

  private resetDuplicateWarning(): void {
    this.duplicateAcknowledged = false;
    this.duplicateMatches = [];
  }

  /** Existing contacts whose first+last name equals the typed name. */
  private findNameMatches(): string[] {
    const norm = (v: unknown) => ('' + (v ?? '')).trim().toLowerCase();
    const first = norm(this.contactForm.controls['first_name'].value);
    const last = norm(this.contactForm.controls['last_name'].value);
    if (!first) return [];
    return this.existingContacts
      .filter(c => norm(c.first_name) === first && norm(c.last_name) === last)
      .slice(0, 3)
      .map(c => {
        const status = c.service === Service.TUTORING
          ? normalizeParentStatus(c.status)
          : c.status;
        const detail = [c.service, staffStatusLabel(status)].filter(Boolean).join(', ');
        return `${c.first_name ?? ''} ${c.last_name ?? ''}`.trim() + (detail ? ` (${detail})` : '');
      });
  }

  createContact(): void {
    if (!this.contactForm.valid || this.submitting) {
      return;
    }
    // Non-blocking duplicate guard: the first Create with a matching name
    // shows who it clashes with; a second Create proceeds anyway.
    if (!this.duplicateAcknowledged) {
      const matches = this.findNameMatches();
      if (matches.length > 0) {
        this.duplicateMatches = matches;
        this.duplicateAcknowledged = true;
        return;
      }
    }
    this.hasError = false;
    this.submitting = true;
    const contact: Contact = this.contactForm.value as Contact;
    this.contactService.createContact(contact).pipe(
      catchError((error: HttpErrorResponse) =>  {
        console.log(error);
        // 409 = a contact with this email already exists (email is the
        // unique identifier for contacts).
        this.errorMessage = error.status === 409
          ? 'A contact with this email already exists.'
          : 'Failed to create the contact. Please try again.';
        this.hasError = true;
        this.submitting = false;
        return EMPTY;
      })
    ).subscribe(response => {
      this.dialogRef.close(response);
    });
  }
}
