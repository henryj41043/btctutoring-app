import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, Input, OnInit, ViewChild} from '@angular/core';
import {ContactService} from '../services/contact.service';
import {catchError, EMPTY, of, switchMap} from 'rxjs';
import {AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Contact as _Contact} from '../models/contact.model';
import {AvailabilityBlock} from '../models/availability-block.model';
import {Weekday, WEEKDAY_LABELS} from '../enums/weekday.enum';
import {PhoneFormatDirective} from '../directives/phone-format.directive';
import {phoneValidator} from '../utils/phone.util';
import {MatInputModule} from '@angular/material/input';
import {Service} from '../enums/service.enum';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatButtonModule} from '@angular/material/button';
import {MatSelectModule} from '@angular/material/select';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {StudentService} from '../services/student.service';
import {NoteService} from '../services/note.service';
import {Student} from '../models/student.model';
import {ScheduleSlot} from '../utils/proration';
import {Note} from '../models/note.model';
import {Status} from '../enums/status.enum';
import {Package} from '../enums/package.enum';
import {MatCheckbox} from '@angular/material/checkbox';
import {BillingCycle} from '../enums/billing-cycle.enum';
import {UserGroup} from '../enums/user-group.enum';
import {AuthService} from '../services/auth.service';
import {DatePipe} from '@angular/common';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {provideNativeDateAdapter} from '@angular/material/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatDialog} from '@angular/material/dialog';
import {StudentSessionsDialog} from '../student-sessions-dialog/student-sessions-dialog';
import {DeleteContactDialog} from '../delete-contact-dialog/delete-contact-dialog';
import {ManageScheduleDialog} from '../manage-schedule-dialog/manage-schedule-dialog';
import {ScheduleService} from '../services/schedule.service';
import {Router} from '@angular/router';

@Component({
  selector: 'app-contact',
  providers: [provideNativeDateAdapter()],
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatCheckbox,
    DatePipe,
    MatDatepickerModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    PhoneFormatDirective,
  ],
  templateUrl: './contact.html',
  styleUrl: './contact.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Contact implements OnInit {
  @Input() id!: string;

  private contactService: ContactService = inject(ContactService);
  private studentService: StudentService = inject(StudentService);
  private noteService: NoteService = inject(NoteService);
  protected authService: AuthService = inject(AuthService);
  private formBuilder: FormBuilder = inject(FormBuilder);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private dialog: MatDialog = inject(MatDialog);
  private scheduleService: ScheduleService = inject(ScheduleService);
  private router: Router = inject(Router);

  @ViewChild('rosterSort') set rosterSort(sort: MatSort) {
    if (sort) { this.rosterDataSource.sort = sort; }
  }
  @ViewChild('rosterPaginator') set rosterPaginator(paginator: MatPaginator) {
    if (paginator) { this.rosterDataSource.paginator = paginator; }
  }
  protected serviceOptions: string[] = Object.values(Service);
  protected statusOptions: string[] = Object.values(Status);
  protected packageOptions: string[] = Object.values(Package);
  protected billingCycleOptions: string[] = Object.values(BillingCycle);
  protected groupOptions: string[] = Object.values(UserGroup);
  protected tutors: _Contact[] = [];
  protected contactLoading: boolean = true;
  protected studentsLoading: boolean = true;
  protected notesLoading: boolean = true;
  protected accountCreated: boolean = false;
  protected accountError: boolean = false;
  protected accountLoading: boolean = false;
  protected contactForm: FormGroup = this.formBuilder.group({
    id: ['', Validators.required],
    first_name: ['', Validators.required],
    last_name: [''],
    email: ['', [Validators.required, Validators.email]],
    phone_number: ['', phoneValidator],
    service: ['', Validators.required],
    status: '',
    billing_cycle: '',
    cc_authorization_received: false,
    twenty_five_deducted: false,
    special_circumstance: '',
    scholarship_state: '',
    invoice_Month: '',
    date_funds_requested_by_btc: undefined,
    date_funds_requested_by_family: undefined,
    invoice_number: '',
    invoice_paid_date: undefined,
    inquiry_received: undefined,
    inquiry_note_from_parent: '',
    consult_date: undefined,
    twenty_five_received: false,
    scholarship_student: false,
    scholarship_name: '',
    trial_date: undefined,
    registration_sent: undefined,
    registration_received: undefined,
    title: '',
    currently_accepting_students: false,
    availability: this.formBuilder.array([]),
    zoom_link: '',
    hourly_rate: 0,
    hiring_inquiry_received: undefined,
    interview_offer_sent: undefined,
    interview_scheduled: undefined,
    offer_sent: undefined,
    onboarding_paperwork_received: undefined,
    training_completed: undefined,
    user_profile_created: false,
    user_group: '',
  });
  protected studentsForm: FormGroup = this.formBuilder.group({
    students: this.formBuilder.array([])
  });
  protected notesForm: FormGroup = this.formBuilder.group({
    notes: this.formBuilder.array([])
  });
  protected notesEditIndex: number = -1;
  protected studentsEditIndex: number = -1;
  // Snapshots of the card being edited, so Cancel can revert unsaved changes.
  private studentEditSnapshot: Record<string, unknown> | null = null;
  private noteEditSnapshot: Record<string, unknown> | null = null;
  // Ids of cards added this session but not yet saved with real data — Cancel
  // on one of these removes the placeholder record entirely.
  private readonly newStudentIds = new Set<string>();
  private readonly newNoteIds = new Set<string>();
  // The contact as last loaded/saved, used to discard unsaved form changes.
  private loadedContact?: _Contact;
  protected readonly Service = Service;
  protected readonly Package = Package;
  protected updatedSuccessfully: boolean = false;
  protected updateError: boolean = false;
  protected rosterDataSource = new MatTableDataSource<Student>([]);
  protected rosterColumns: string[] = ['name', 'status', 'package', 'make_up_minutes', 'scholarship'];

  ngOnInit() {
    this.loadContact();
    this.loadStudents();
    this.loadNotes();
    this.getTutors();
    this.loadRosterStudents();
  }

  private loadRosterStudents() {
    this.studentService.getStudentsByTutor(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(students => {
      this.rosterDataSource.data = students;
      this.cdr.markForCheck();
    });
  }

  private getTutors() {
    this.contactService.getStaff()
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(contacts => {
        this.tutors = [...contacts.filter(contact => {
          return contact.status === Status.STAFF && contact.currently_accepting_students && contact.service === Service.HIRING;
        })];
      });
  }

  get notes(): FormArray {
    return this.notesForm.controls['notes'] as FormArray;
  }

  get students(): FormArray {
    return this.studentsForm.controls['students'] as FormArray;
  }

  // ── Tutoring availability ────────────────────────────────────────────────
  protected readonly weekdayOptions: Weekday[] = Object.values(Weekday);
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  /** 30-min increments from 6:00 AM to 9:00 PM as { value: 'HH:mm', label: '1:00 PM' }. */
  protected readonly timeOptions: { value: string; label: string }[] = this.buildTimeOptions();

  get availabilityBlocks(): FormArray {
    return this.contactForm.controls['availability'] as FormArray;
  }

  private createAvailabilityGroup(block?: AvailabilityBlock): FormGroup {
    return this.formBuilder.group({
      days: [block?.days ?? [], Validators.required],
      start_time: [block?.start_time ?? '', Validators.required],
      end_time: [block?.end_time ?? '', Validators.required],
    });
  }

  addAvailabilityBlock(): void {
    this.availabilityBlocks.push(this.createAvailabilityGroup());
    this.contactForm.markAsDirty();
  }

  removeAvailabilityBlockAt(index: number): void {
    this.availabilityBlocks.removeAt(index);
    this.contactForm.markAsDirty();
  }

  private buildTimeOptions(): { value: string; label: string }[] {
    const options: { value: string; label: string }[] = [];
    for (let minutes = 6 * 60; minutes <= 21 * 60; minutes += 30) {
      const h24 = Math.floor(minutes / 60);
      const m = minutes % 60;
      const value = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
      const period = h24 < 12 ? 'AM' : 'PM';
      const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
      const label = `${h12}:${m.toString().padStart(2, '0')} ${period}`;
      options.push({ value, label });
    }
    return options;
  }

  private loadContact() {
    this.contactService.getContact(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(contacts => {
      this.loadedContact = contacts[0];
      this.buildContactForm(contacts[0]);
      this.contactLoading = false;
    });
  }

  private buildContactForm(contact: _Contact) {
    this.contactForm.controls['id'].setValue(contact.id);
    this.contactForm.controls['first_name'].setValue(contact.first_name);
    this.contactForm.controls['last_name'].setValue(contact.last_name);
    this.contactForm.controls['email'].setValue(contact.email);
    this.contactForm.controls['phone_number'].setValue(contact.phone_number);
    this.contactForm.controls['service'].setValue(contact.service);
    this.contactForm.controls['billing_cycle'].setValue(contact.billing_cycle);
    this.contactForm.controls['cc_authorization_received'].setValue(contact.cc_authorization_received);
    this.contactForm.controls['twenty_five_deducted'].setValue(contact.twenty_five_deducted);
    this.contactForm.controls['special_circumstance'].setValue(contact.special_circumstance);
    this.contactForm.controls['scholarship_state'].setValue(contact.scholarship_state);
    this.contactForm.controls['invoice_Month'].setValue(contact.invoice_Month);
    this.contactForm.controls['date_funds_requested_by_btc'].setValue(contact.date_funds_requested_by_btc);
    this.contactForm.controls['date_funds_requested_by_family'].setValue(contact.date_funds_requested_by_family);
    this.contactForm.controls['invoice_number'].setValue(contact.invoice_number);
    this.contactForm.controls['invoice_paid_date'].setValue(contact.invoice_paid_date);
    this.contactForm.controls['inquiry_received'].setValue(contact.inquiry_received);
    this.contactForm.controls['inquiry_note_from_parent'].setValue(contact.inquiry_note_from_parent);
    this.contactForm.controls['consult_date'].setValue(contact.consult_date);
    this.contactForm.controls['twenty_five_received'].setValue(contact.twenty_five_received);
    this.contactForm.controls['scholarship_student'].setValue(contact.scholarship_student);
    this.contactForm.controls['scholarship_name'].setValue(contact.scholarship_name);
    this.contactForm.controls['trial_date'].setValue(contact.trial_date);
    this.contactForm.controls['registration_sent'].setValue(contact.registration_sent);
    this.contactForm.controls['registration_received'].setValue(contact.registration_received);
    this.contactForm.controls['status'].setValue(contact.status);
    this.contactForm.controls['title'].setValue(contact.title);
    this.contactForm.controls['currently_accepting_students'].setValue(contact.currently_accepting_students);
    this.availabilityBlocks.clear();
    (contact.availability ?? []).forEach(block =>
      this.availabilityBlocks.push(this.createAvailabilityGroup(block)),
    );
    this.contactForm.controls['zoom_link'].setValue(contact.zoom_link);
    this.contactForm.controls['hourly_rate'].setValue(contact.hourly_rate);
    this.contactForm.controls['hiring_inquiry_received'].setValue(contact.hiring_inquiry_received);
    this.contactForm.controls['interview_offer_sent'].setValue(contact.interview_offer_sent);
    this.contactForm.controls['interview_scheduled'].setValue(contact.interview_scheduled);
    this.contactForm.controls['offer_sent'].setValue(contact.offer_sent);
    this.contactForm.controls['onboarding_paperwork_received'].setValue(contact.onboarding_paperwork_received);
    this.contactForm.controls['training_completed'].setValue(contact.training_completed);
    this.contactForm.controls['user_profile_created'].setValue(contact.user_profile_created);
    this.contactForm.controls['user_group'].setValue(contact.user_group);

    // Tutors cannot edit their own service, status, group, or hiring process fields
    if (!this.authService.isAdmin()) {
      [
        'service', 'status', 'user_group',
        'hiring_inquiry_received', 'interview_offer_sent', 'interview_scheduled',
        'offer_sent', 'onboarding_paperwork_received', 'training_completed',
      ].forEach(ctrl => this.contactForm.controls[ctrl].disable());
    }

    this.contactForm.updateValueAndValidity();
    this.accountCreated = contact.user_profile_created ?? false;
    this.cdr.markForCheck();
  }

  private loadStudents() {
    this.studentService.getStudentsByContact(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(students => {
      this.buildStudentsFormArray(students);
      this.studentsLoading = false;
      this.cdr.markForCheck();
    });
  }

  private buildStudentsFormArray(students: Student[]) {
    students.forEach(student => {
      this.students.push(this.formBuilder.group({
        id: [student.id, Validators.required],
        contact_id: [student.contact_id, Validators.required],
        name: [student.name, Validators.required],
        birthday: student.birthday,
        status: [student.status, Validators.required],
        assigned_tutor_id: student.assigned_tutor_id,
        package: student.package,
        scholarship: student.scholarship,
        // Carried through edits so saving a student here never wipes the
        // schedule/billing fields owned by the session dialog + billing flow.
        schedule: [student.schedule ?? null],
        package_start_date: [student.package_start_date ?? null],
        auto_renew: [student.auto_renew ?? false],
        custom_monthly_cost: student.custom_monthly_cost ?? null,
        custom_sessions_per_week: student.custom_sessions_per_week ?? null,
        custom_session_length_min: student.custom_session_length_min ?? null,
        make_up_minutes: student.make_up_minutes,
      }));
    });
    this.students.updateValueAndValidity();
  }

  private loadNotes() {
    this.noteService.getNotesByRecipient(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    ).subscribe(notes => {
      this.buildNotesFormArray(notes);
      this.notesLoading = false;
      this.cdr.markForCheck();
    });
  }

  private buildNotesFormArray(notes: Note[]) {
    const sortedNotes = [...notes].sort(
      (a, b) => new Date(b.date_time ?? 0).getTime() - new Date(a.date_time ?? 0).getTime(),
    );
    sortedNotes.forEach(note => {
      this.notes.push(this.formBuilder.group({
        id: [note.id, Validators.required],
        message: note.message,
        date_time: note.date_time,
        author: note.author,
        author_id: note.author_id,
        recipient: note.recipient,
        recipient_id: note.recipient_id,
        type: note.type,
      }));
    });
    this.notes.updateValueAndValidity();
  }

  setNotesEditIndex(index: number) {
    if (index >= 0) {
      this.noteEditSnapshot = this.notes.at(index)?.getRawValue() as Record<string, unknown>;
    }
    this.notesEditIndex = index;
    this.cdr.markForCheck();
  }

  setStudentsEditIndex(index: number) {
    if (index >= 0) {
      this.studentEditSnapshot = this.students.at(index)?.getRawValue() as Record<string, unknown>;
    }
    this.studentsEditIndex = index;
    this.cdr.markForCheck();
  }

  /** Cancels editing a student card: a brand-new card is removed entirely, an
   *  existing one is reverted to its values from when editing began. */
  cancelStudentEdit(index: number) {
    const group = this.students.at(index)!;
    const id = group.get('id')!.value as string;
    this.studentsEditIndex = -1;
    if (this.newStudentIds.has(id)) {
      this.newStudentIds.delete(id);
      this.deleteStudentAt(index);
      return;
    }
    if (this.studentEditSnapshot) {
      group.reset(this.studentEditSnapshot);
    }
    this.cdr.markForCheck();
  }

  /** Cancels editing a note card (see {@link cancelStudentEdit}). */
  cancelNoteEdit(index: number) {
    const group = this.notes.at(index)!;
    const id = group.get('id')!.value as string;
    this.notesEditIndex = -1;
    if (this.newNoteIds.has(id)) {
      this.newNoteIds.delete(id);
      this.deleteNoteAt(index);
      return;
    }
    if (this.noteEditSnapshot) {
      group.reset(this.noteEditSnapshot);
    }
    this.cdr.markForCheck();
  }

  /** Reverts all unsaved changes to the contact form back to the loaded record. */
  discardContactChanges() {
    if (this.loadedContact) {
      this.buildContactForm(this.loadedContact);
    }
    this.contactForm.markAsPristine();
    this.contactForm.markAsUntouched();
    this.cdr.markForCheck();
  }

  /** True once a student has both an assigned tutor and a package — required to schedule. */
  canManageSchedule(group: AbstractControl): boolean {
    return !!group.get('assigned_tutor_id')?.value && !!group.get('package')?.value;
  }

  /** A read-only one-line summary of a student's schedule, e.g. "Mon 10:00 AM · Wed 10:00 AM". */
  scheduleSummary(group: AbstractControl): string {
    const schedule = group.get('schedule')?.value as ScheduleSlot[] | undefined;
    return this.scheduleService.scheduleSummary(schedule).join(' · ');
  }

  /** Opens the Manage Schedule dialog for a student and applies the result to the card. */
  openManageScheduleDialog(index: number): void {
    const group = this.students.at(index)!;
    const student: Student = group.getRawValue() as Student;
    this.contactService.getContact(student.assigned_tutor_id!).pipe(
      catchError(error => {
        console.log(error);
        return of([] as _Contact[]);
      })
    ).subscribe(contacts => {
      const ref = this.dialog.open(ManageScheduleDialog, {
        data: {student, tutor: contacts[0]},
        width: '520px',
      });
      ref.afterClosed().subscribe((updated?: Student) => {
        if (!updated) return;
        group.patchValue({
          assigned_tutor_id: updated.assigned_tutor_id ?? student.assigned_tutor_id,
          schedule: updated.schedule ?? null,
          package_start_date: updated.package_start_date ?? null,
          auto_renew: updated.auto_renew ?? false,
        });
        this.cdr.markForCheck();
      });
    });
  }

  deleteNoteAt(index: number) {
    const noteToDelete: Note = this.notes.controls.at(index)?.value as Note;
    this.noteService.deleteNote(noteToDelete.id!)
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(response => {
        console.log(response.message);
        this.notes.removeAt(index);
        this.notes.updateValueAndValidity();
        this.cdr.markForCheck();
      });
  }

  deleteStudentAt(index: number) {
    const studentToDelete: Student = this.students.controls.at(index)?.value as Student;
    this.studentService.deleteStudent(studentToDelete.id!)
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(response => {
        console.log(response.message);
        this.students.removeAt(index);
        this.students.updateValueAndValidity();
        this.cdr.markForCheck();
      });
  }

  saveNoteAt(index: number) {
    const noteToSave: Note = this.notes.controls.at(index)?.value as Note;
    this.noteService.updateNote(noteToSave)
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(note => {
        console.log(`Note ${note.id} updated successfully.`);
        this.newNoteIds.delete(noteToSave.id!);
        this.setNotesEditIndex(-1);
      });
  }

  saveStudentAt(index: number) {
    const studentToSave: Student = this.students.controls.at(index)?.value as Student;
    this.studentService.updateStudent(studentToSave)
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(student => {
        console.log(`Student ${student.id} updated successfully.`);
        this.newStudentIds.delete(studentToSave.id!);
        this.setStudentsEditIndex(-1);
      });
  }

  addNote() {
    let date = new Date();
    let note: Note = new Note();
    const dateString = date.toISOString();
    const author = this.authService.contact().first_name;
    const authorId = this.authService.contact().id;
    const recipient = this.contactForm.controls['first_name'].value;
    const recipientId = this.contactForm.controls['id'].value;
    note.date_time = dateString;
    note.author = author;
    note.author_id = authorId;
    note.recipient = recipient;
    note.recipient_id = recipientId;
    this.noteService.createNote(note)
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(response => {
        // Newest note goes to the top so it matches the most-recent-first order.
        this.notes.insert(0, this.formBuilder.group({
          id: response.id,
          message: response.message,
          date_time: dateString,
          author: author,
          author_id: authorId,
          recipient: recipient,
          recipient_id: recipientId,
          type: '',
        }));
        this.notes.updateValueAndValidity();
        this.newNoteIds.add(response.id);
        this.setNotesEditIndex(0);
      });
  }

  addStudent() {
    let student: Student = new Student();
    student.contact_id = this.id;
    this.studentService.createStudent(student)
    .pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      })
    )
    .subscribe(response => {
      this.students.push(this.formBuilder.group({
        id: response.id,
        contact_id: this.id,
        name: ['', Validators.required],
        birthday: '',
        status: ['', Validators.required],
        assigned_tutor_id: '',
        package: ['', Validators.required],
        scholarship: false,
        schedule: [null],
        package_start_date: [null],
        auto_renew: [false],
        custom_monthly_cost: [null],
        custom_sessions_per_week: [null],
        custom_session_length_min: [null],
        make_up_minutes: 0
      }));
      this.students.updateValueAndValidity();
      this.newStudentIds.add(response.id);
      this.setStudentsEditIndex(this.students.controls.length - 1);
    });
  }

  createAccount() {
    // A user with no group is locked out of the whole app, so a group is
    // mandatory. The Create button is also disabled until one is chosen.
    if (!this.contactForm.controls['email'].valid || !this.contactForm.controls['user_group'].value) {
      this.accountError = true;
      this.cdr.markForCheck();
      return;
    }
    this.accountLoading = true;
    this.accountError = false;
    this.cdr.markForCheck();
    this.contactService.adminCreateUser(
      this.contactForm.controls['email'].value,
      this.contactForm.controls['user_group'].value,
      this.id
    ).pipe(
      catchError(error => {
        console.log(error);
        this.accountError = true;
        this.accountLoading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(() => {
      this.accountError = false;
      this.accountCreated = true;
      this.contactForm.controls['user_profile_created'].setValue(true);
      // Mirror the new Cognito account onto the contact record so the two stay
      // in sync without waiting for a manual save.
      this.persistAccountMirror();
    });
  }

  deleteAccount() {
    if (!this.contactForm.controls['email'].valid) {
      return;
    }
    this.accountLoading = true;
    this.cdr.markForCheck();
    this.contactService.adminDeleteUser(this.contactForm.controls['email'].value!).pipe(
      catchError(error => {
        console.log(error);
        this.accountError = true;
        this.accountLoading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(() => {
      this.accountError = false;
      this.accountCreated = false;
      this.contactForm.controls['user_profile_created'].setValue(false);
      this.persistAccountMirror();
    });
  }

  /** Persists user_profile_created + user_group to the contact record so it
   *  mirrors the Cognito account. Used after create/delete account. */
  private persistAccountMirror(): void {
    const contact: _Contact = this.contactForm.getRawValue() as _Contact;
    this.contactService.updateContact(contact).pipe(
      catchError(error => {
        console.log(error);
        this.accountLoading = false;
        this.cdr.markForCheck();
        return EMPTY;
      })
    ).subscribe(() => {
      this.loadedContact = contact;
      this.accountLoading = false;
      this.contactForm.markAsPristine();
      this.contactForm.markAsUntouched();
      this.cdr.markForCheck();
    });
  }

  updateContact() {
    if (!this.contactForm.valid) {
      return;
    }
    const contact: _Contact = this.contactForm.value as _Contact;
    // If the group changed on a contact that already has an account, Cognito
    // must be updated too. Doing it first means a Cognito failure aborts the
    // save, so the contact record can't drift ahead of the actual group.
    const accountExists = this.loadedContact?.user_profile_created ?? false;
    const groupChanged =
      accountExists && !!contact.email && contact.user_group !== this.loadedContact?.user_group;
    const save$ = groupChanged
      ? this.contactService
          .adminUpdateUserGroup(contact.email!, contact.user_group ?? '')
          .pipe(switchMap(() => this.contactService.updateContact(contact)))
      : this.contactService.updateContact(contact);

    save$
      .pipe(
        catchError(error => {
          console.log(error);
          this.updatedSuccessfully = false;
          this.updateError = true;
          this.cdr.markForCheck();
          setTimeout(() => {
            this.updateError = false;
            this.cdr.markForCheck();
          }, 1000);
          return EMPTY;
        })
      )
      .subscribe(() => {
        this.loadedContact = contact;
        this.updatedSuccessfully = true;
        this.updateError = false;
        this.contactForm.markAsPristine();
        this.contactForm.markAsUntouched();
        this.cdr.markForCheck();
        setTimeout(() => {
          this.updatedSuccessfully = false;
          this.cdr.markForCheck();
        }, 1000);
      });
  }

  openDeleteDialog(): void {
    const contact = this.contactForm.value as _Contact;
    // Populate fields that may be disabled (disabled controls are excluded from .value)
    contact.id = this.contactForm.controls['id'].value;
    contact.email = this.contactForm.controls['email'].value;
    contact.user_profile_created = this.contactForm.controls['user_profile_created'].value;

    const ref = this.dialog.open(DeleteContactDialog, {
      data: contact,
      width: '420px',
    });
    ref.afterClosed().subscribe((deleted: boolean) => {
      if (deleted) {
        void this.router.navigate(['/contacts']);
      }
    });
  }

  openSessionsDialog(student: Student): void {
    this.dialog.open(StudentSessionsDialog, {
      data: student,
      width: '700px',
    });
  }

  getTutorName(id: string): string {
    if (!id) return '—';
    const tutor = this.tutors.find(t => t.id === id);
    return tutor ? `${tutor.first_name} ${tutor.last_name}`.trim() : id;
  }

}
