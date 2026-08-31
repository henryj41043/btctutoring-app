import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ContactService} from '../services/contact.service';
import {catchError, EMPTY, forkJoin, of, switchMap} from 'rxjs';
import {FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {Contact as _Contact} from '../models/contact.model';
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
import {Note} from '../models/note.model';
import {StudentStatus} from '../enums/student-status.enum';
import {TwentyFiveStatus} from '../enums/twenty-five-status.enum';
import {HireType} from '../enums/hire-type.enum';
import {StaffStatus, staffStatusLabel} from '../enums/staff-status.enum';
import {ParentStatus} from '../enums/parent-status.enum';
import {cascadeTargetFor} from '../utils/parent-status-cascade';
import {Package} from '../enums/package.enum';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatTooltipModule} from '@angular/material/tooltip';
import {BillingCycle} from '../enums/billing-cycle.enum';
import {UserGroup} from '../enums/user-group.enum';
import {AuthService} from '../services/auth.service';
import {DatePipe} from '@angular/common';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {CdkDragDrop, DragDropModule} from '@angular/cdk/drag-drop';
import {provideNativeDateAdapter} from '@angular/material/core';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatDialog} from '@angular/material/dialog';
import {StudentSessionsDialog} from '../student-sessions-dialog/student-sessions-dialog';
import {DeleteContactDialog} from '../delete-contact-dialog/delete-contact-dialog';
import {ManageScheduleDialog} from '../manage-schedule-dialog/manage-schedule-dialog';
import {StudentDialog, StudentDialogMode, StudentDialogResult} from '../student-dialog/student-dialog';
import {TrialSessionDialog} from '../trial-session-dialog/trial-session-dialog';
import {BillingService} from '../services/billing.service';
import {BillingRecord} from '../models/billing-record.model';
import {currentPeriodAmounts, recomputedBillingRecords} from '../utils/billing-recompute';
import {minNoteOrder, noteDateIso, noteGroup, sortNotes} from '../utils/note-forms';
import {buildTimeOptions, createAvailabilityGroup} from '../utils/availability-forms';
import {availableMakeupMinutes} from '../utils/makeup';
import {studentDisplayName} from '../utils/student-name';
import {pendingPackageNote} from '../utils/pending-package';
import {studentStatusChipClass} from '../utils/status-chip';
import {normalizeParentStatus} from '../utils/legacy-status';
import {ScheduleService} from '../services/schedule.service';
import {ContactRemindersSection} from '../contact-reminders-section/contact-reminders-section';
import {ContactEmailsSection} from '../contact-emails-section/contact-emails-section';
import {ContactScholarshipSection} from '../contact-scholarship-section/contact-scholarship-section';
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
    MatTooltipModule,
    DatePipe,
    MatDatepickerModule,
    MatTimepickerModule,
    DragDropModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    PhoneFormatDirective,
    ContactRemindersSection,
    ContactEmailsSection,
    ContactScholarshipSection,
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
  // Cancels in-flight HTTP reads when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);
  private dialog: MatDialog = inject(MatDialog);
  private scheduleService: ScheduleService = inject(ScheduleService);
  private billingService: BillingService = inject(BillingService);
  private router: Router = inject(Router);

  @ViewChild('rosterSort') set rosterSort(sort: MatSort) {
    if (sort) { this.rosterDataSource.sort = sort; }
  }
  @ViewChild('rosterPaginator') set rosterPaginator(paginator: MatPaginator) {
    if (paginator) { this.rosterDataSource.paginator = paginator; }
  }
  protected serviceOptions: string[] = Object.values(Service);
  protected staffStatusOptions: string[] = Object.values(StaffStatus);
  protected parentStatusOptions: string[] = Object.values(ParentStatus);
  protected readonly staffStatusLabel = staffStatusLabel;
  protected packageOptions: string[] = Object.values(Package);
  protected billingCycleOptions: string[] = Object.values(BillingCycle);
  protected groupOptions: string[] = Object.values(UserGroup);
  protected tutors: _Contact[] = [];
  protected readonly twentyFiveStatusOptions: string[] = Object.values(TwentyFiveStatus);
  protected readonly hireTypeOptions: string[] = Object.values(HireType);
  protected readonly studentDisplayName = studentDisplayName;
  protected readonly statusChipClass = studentStatusChipClass;
  // Name lookup for ALL staff (unfiltered) — `tutors` is the assignment
  // dropdown and excludes tutors not currently accepting students, which must
  // not hide their names on students already assigned to them.
  private staffById = new Map<string, _Contact>();
  private staffLoaded = false;
  // IDs already fetched individually (former staff) — guards refetch loops.
  private individuallyFetchedTutorIds = new Set<string>();
  protected contactLoading: boolean = true;
  protected studentsLoading: boolean = true;
  protected notesLoading: boolean = true;
  protected accountCreated: boolean = false;
  protected accountError: boolean = false;
  protected accountLoading: boolean = false;
  protected contactForm: FormGroup = this.formBuilder.group({
    id: ['', Validators.required],
    // Optional (kept symmetric with the create dialog): newsletter signups
    // have only an email address.
    first_name: [''],
    last_name: [''],
    email: ['', [Validators.required, Validators.email]],
    phone_number: ['', phoneValidator],
    service: ['', Validators.required],
    status: '',
    billing_cycle: '',
    sibling_discount: 0,
    cc_authorization_received: false,
    twenty_five_deducted: false,
    special_circumstance: '',
    inquiry_received: undefined,
    inquiry_note_from_parent: '',
    consult_date: undefined,
    twenty_five_received: false,
    twenty_five_status: TwentyFiveStatus.PENDING,
    scholarship_student: false,
    scholarship_name: '',
    trial_date: undefined,
    registration_sent: undefined,
    registration_received: undefined,
    title: '',
    currently_accepting_students: false,
    is_tutor: true,
    availability: this.formBuilder.array([]),
    zoom_link: '',
    hourly_rate: 0,
    hire_type: '',
    hiring_inquiry_received: undefined,
    interview_offer_sent: undefined,
    interview_scheduled: undefined,
    offer_sent: undefined,
    onboarding_paperwork_received: undefined,
    training_completed: undefined,
    user_profile_created: false,
    user_group: '',
  });
  protected notesForm: FormGroup = this.formBuilder.group({
    notes: this.formBuilder.array([])
  });
  protected notesEditIndex: number = -1;
  /** Shown in the editing card when a save was attempted with no message. */
  protected noteEmptyError: boolean = false;
  /** Shown in the editing card when a note save hit a server error. */
  protected noteSaveFailed: boolean = false;
  // Snapshot of the note card being edited, so Cancel can revert unsaved changes.
  private noteEditSnapshot: Record<string, unknown> | null = null;
  // Ids of note cards added this session but not yet saved with real data —
  // Cancel on one of these removes the placeholder record entirely.
  private readonly newNoteIds = new Set<string>();
  // The contact as last loaded/saved, used to discard unsaved form changes.
  private loadedContact?: _Contact;
  protected readonly Service = Service;
  protected readonly Package = Package;
  protected readonly StudentStatus = StudentStatus;
  protected updatedSuccessfully: boolean = false;
  protected updateError: boolean = false;
  /** Save was attempted while the form is invalid (highlighted fields shown). */
  protected updateInvalid: boolean = false;
  // The contact's students (parent/family view). Edited via the Student dialog,
  // reloaded from the backend after every create/edit/delete/schedule change.
  protected students: Student[] = [];
  protected rosterDataSource = new MatTableDataSource<Student>([]);
  protected rosterColumns: string[] = ['name', 'status', 'package', 'make_up_minutes', 'scholarship'];
  ngOnInit() {
    this.loadContact();
    // Family students are an admin view — tutors only ever see their own
    // (Hiring) page, where the roster loads via loadContact instead. The
    // Outstanding Reminders and Emails sections are child components that
    // load (and admin-gate) themselves.
    if (this.authService.isAdmin()) {
      this.loadStudents();
    } else {
      this.studentsLoading = false;
    }
    this.loadNotes();
    this.getTutors();
  }

  private loadRosterStudents() {
    this.studentService.getStudentsByTutor(this.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(students => {
      // The tutor's roster is their CURRENT roster — previously-assigned
      // students who are no longer active stay off it.
      this.rosterDataSource.data = students.filter(s => s.status === StudentStatus.ACTIVE_STUDENT);
      this.cdr.markForCheck();
    });
  }

  private getTutors() {
    this.contactService.getStaff()
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(contacts => {
        contacts.forEach(c => {
          if (c.id) this.staffById.set(c.id, c);
        });
        this.tutors = [...contacts.filter(contact => {
          return contact.status === StaffStatus.ACTIVE_STAFF && contact.currently_accepting_students && contact.is_tutor !== false && contact.service === Service.HIRING;
        })];
        this.staffLoaded = true;
        this.resolveMissingTutorNames();
        this.cdr.markForCheck();
      });
  }

  /**
   * getStaff() only returns current staff — a tutor who has since left won't
   * be in it, so fetch any still-unresolved assigned tutors by id. Runs after
   * both the staff list and the students have loaded (call sites cover both
   * orderings).
   */
  private resolveMissingTutorNames() {
    if (!this.staffLoaded) return;
    // Assigned tutors AND any per-slot tutors — a former staff member named
    // on a slot must still resolve for the schedule summary.
    const missing = new Set(this.students
      .flatMap(s => [s.assigned_tutor_id, ...(s.schedule ?? []).map(slot => slot.tutor_id)])
      .filter((id): id is string =>
        !!id && !this.staffById.has(id) && !this.individuallyFetchedTutorIds.has(id)));
    missing.forEach(id => {
      this.individuallyFetchedTutorIds.add(id);
      this.contactService.getContact(id).pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      ).subscribe(contacts => {
        if (contacts[0]) {
          this.staffById.set(id, contacts[0]);
          this.cdr.markForCheck();
        }
      });
    });
  }

  get notes(): FormArray {
    return this.notesForm.controls['notes'] as FormArray;
  }

  // ── Tutoring availability ────────────────────────────────────────────────
  protected readonly weekdayOptions: Weekday[] = Object.values(Weekday);
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  /** 30-min increments from 6:00 AM to 9:00 PM as { value: 'HH:mm', label: '1:00 PM' }. */
  protected readonly timeOptions: { value: string; label: string }[] = buildTimeOptions();

  get availabilityBlocks(): FormArray {
    return this.contactForm.controls['availability'] as FormArray;
  }

  addAvailabilityBlock(): void {
    this.availabilityBlocks.push(createAvailabilityGroup(this.formBuilder));
    this.contactForm.markAsDirty();
  }

  removeAvailabilityBlockAt(index: number): void {
    this.availabilityBlocks.removeAt(index);
    this.contactForm.markAsDirty();
  }

  private loadContact() {
    this.contactService.getContact(this.id).pipe(
      catchError(error => {
        console.log(error);
        this.contactLoading = false;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(contacts => {
      this.loadedContact = contacts[0];
      this.buildContactForm(contacts[0]);
      this.contactLoading = false;
      // Only staff have a tutor roster - a parent page was previously firing
      // this (always-empty) fetch too.
      if (contacts[0]?.service === Service.HIRING) {
        this.loadRosterStudents();
      }
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
    this.contactForm.controls['sibling_discount'].setValue(contact.sibling_discount ?? 0);
    this.contactForm.controls['cc_authorization_received'].setValue(contact.cc_authorization_received);
    this.contactForm.controls['twenty_five_deducted'].setValue(contact.twenty_five_deducted);
    this.contactForm.controls['special_circumstance'].setValue(contact.special_circumstance);
    this.contactForm.controls['inquiry_received'].setValue(contact.inquiry_received);
    this.contactForm.controls['inquiry_note_from_parent'].setValue(contact.inquiry_note_from_parent);
    this.contactForm.controls['consult_date'].setValue(contact.consult_date);
    this.contactForm.controls['twenty_five_received'].setValue(contact.twenty_five_received);
    // New tri-state wins; a legacy checked box reads as Received.
    this.contactForm.controls['twenty_five_status'].setValue(
      contact.twenty_five_status ??
        (contact.twenty_five_received ? TwentyFiveStatus.RECEIVED : TwentyFiveStatus.PENDING));
    this.contactForm.controls['scholarship_student'].setValue(contact.scholarship_student);
    this.contactForm.controls['scholarship_name'].setValue(contact.scholarship_name);
    this.contactForm.controls['trial_date'].setValue(contact.trial_date);
    this.contactForm.controls['registration_sent'].setValue(contact.registration_sent);
    this.contactForm.controls['registration_received'].setValue(contact.registration_received);
    // Tutoring contacts normalize legacy pre-v3 statuses so the parent
    // dropdown always holds a selectable value (self-heals on next save).
    this.contactForm.controls['status'].setValue(
      contact.service === Service.TUTORING
        ? normalizeParentStatus(contact.status)
        : contact.status);
    this.contactForm.controls['title'].setValue(contact.title);
    this.contactForm.controls['currently_accepting_students'].setValue(contact.currently_accepting_students);
    // Undefined reads as true — every pre-flag staff member is a tutor.
    this.contactForm.controls['is_tutor'].setValue(contact.is_tutor !== false);
    this.availabilityBlocks.clear();
    (contact.availability ?? []).forEach(block =>
      this.availabilityBlocks.push(createAvailabilityGroup(this.formBuilder, block)),
    );
    this.contactForm.controls['zoom_link'].setValue(contact.zoom_link);
    this.contactForm.controls['hourly_rate'].setValue(contact.hourly_rate);
    this.contactForm.controls['hire_type'].setValue(contact.hire_type);
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

  /** Loads (and re-loads after a create/edit/delete/schedule change) the students list. */
  private loadStudents(then?: () => void) {
    this.studentService.getStudentsByContact(this.id).pipe(
      catchError(error => {
        console.log(error);
        this.studentsLoading = false;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(students => {
      this.students = students;
      this.studentsLoading = false;
      this.resolveMissingTutorNames();
      this.cdr.markForCheck();
      then?.();
    });
  }

  private loadNotes() {
    this.noteService.getNotesByRecipient(this.id).pipe(
      catchError(error => {
        console.log(error);
        this.notesLoading = false;
        this.cdr.markForCheck();
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(notes => {
      this.buildNotesFormArray(notes);
      this.notesLoading = false;
      this.cdr.markForCheck();
    });
  }

  private buildNotesFormArray(notes: Note[]) {
    sortNotes(notes).forEach(note => this.notes.push(noteGroup(this.formBuilder, note)));
    this.notes.updateValueAndValidity();
  }

  /** True once every note carries a manual order (i.e. the user has dragged). */
  get notesHaveManualOrder(): boolean {
    return this.notes.length > 0 && this.notes.controls.every(c => c.get('order')?.value != null);
  }

  setNotesEditIndex(index: number) {
    if (index >= 0) {
      this.noteEditSnapshot = this.notes.at(index)?.getRawValue() as Record<string, unknown>;
    }
    this.notesEditIndex = index;
    this.cdr.markForCheck();
  }

  /** Cancels editing a note card: a brand-new (never-persisted) card is
   *  discarded locally, an existing one is reverted to its values from when
   *  editing began. */
  cancelNoteEdit(index: number) {
    const group = this.notes.at(index)!;
    const id = group.get('id')!.value as string;
    this.notesEditIndex = -1;
    this.noteEmptyError = false;
    this.noteSaveFailed = false;
    if (this.newNoteIds.has(id)) {
      // Never hit the server — the note only ever existed in this form.
      this.newNoteIds.delete(id);
      this.notes.removeAt(index);
      this.notes.updateValueAndValidity();
    } else if (this.noteEditSnapshot) {
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
    this.updateInvalid = false;
    this.cdr.markForCheck();
  }

  /** A student's currently-available make-up minutes (expired batches excluded). */
  availableMakeup(student: Student): number {
    return availableMakeupMinutes(student);
  }

  /** True when the family has 3+ active, enrolled students — the sibling-discount condition. */
  get qualifiesForSiblingDiscount(): boolean {
    return this.students.filter(s => s.status === StudentStatus.ACTIVE_STUDENT && !!s.package).length >= 3;
  }

  // In-flight per-student trial-date saves (blocks double-fire from the picker).
  private savingTrialIds = new Set<string>();

  /** The student's trial date as a local Date for the picker (UTC-parse safe). */
  trialDateFor(student: Student): Date | null {
    if (!student.trial_date) {
      return null;
    }
    const [year, month, day] = student.trial_date.split('-').map(Number);
    return year && month && day ? new Date(year, month - 1, day) : new Date(student.trial_date);
  }

  /** Persists a picked trial date straight onto the student (partial update). */
  saveTrialDate(student: Student, date: Date | null): void {
    const id = student.id;
    if (!id || !date || this.savingTrialIds.has(id)) {
      return;
    }
    const iso = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    if (iso === student.trial_date) {
      return;
    }
    this.savingTrialIds.add(id);
    this.studentService
      .updateStudent({
        id,
        contact_id: student.contact_id,
        name: student.name,
        trial_date: iso,
      } as Student)
      .pipe(
        catchError(error => {
          console.log(error);
          this.savingTrialIds.delete(id);
          this.cdr.markForCheck();
          return EMPTY;
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => {
        this.savingTrialIds.delete(id);
        student.trial_date = iso;
        this.cdr.markForCheck();
      });
  }

  /** A trial can be scheduled once the student has a resolvable assigned tutor. */
  canScheduleTrial(student: Student): boolean {
    return !!student.id && !!student.assigned_tutor_id && this.staffById.has(student.assigned_tutor_id);
  }

  /** Opens the trial scheduler for a student; syncs the picked date on close. */
  openTrialDialog(student: Student): void {
    const tutor = student.assigned_tutor_id
      ? this.staffById.get(student.assigned_tutor_id)
      : undefined;
    if (!tutor) {
      return;
    }
    const ref = this.dialog.open(TrialSessionDialog, {
      data: {student, tutor},
      width: '420px',
    });
    ref.afterClosed().subscribe((scheduledIso?: string) => {
      if (scheduledIso) {
        // The session's date is the trial date of record.
        student.trial_date = scheduledIso;
        this.cdr.markForCheck();
      }
    });
  }

  /** Scholarship paperwork applies when any student in the family holds one. */
  get hasScholarshipStudent(): boolean {
    return this.students.some(s => !!s.scholarship);
  }

  /** The student's scheduled-change note, e.g. '→ Achieve from Sep 1'. */
  pendingNote(student: Student): string | null {
    return pendingPackageNote(student);
  }

  /** True once a student has both an assigned tutor and a package — required to schedule. */
  canManageSchedule(student: Student): boolean {
    return !!student.assigned_tutor_id && !!student.package;
  }

  /** A read-only one-line summary of a student's schedule, e.g. "Mon 10:00 AM · Wed 10:00 AM". */
  scheduleSummary(student: Student): string {
    return this.scheduleService.scheduleSummary(
      student.schedule,
      student.assigned_tutor_id,
      id => this.staffById.get(id)?.first_name,
    ).join(' · ');
  }

  /** Opens the Manage Schedule dialog for a student; reloads on a persisted change. */
  openManageScheduleDialog(
    student: Student,
    recomputeBilling: boolean = false,
    pendingMode: boolean = false,
  ): void {
    this.contactService.getContact(student.assigned_tutor_id!).pipe(
      catchError(error => {
        console.log(error);
        return of([] as _Contact[]);
      })
    ).subscribe(contacts => {
      const ref = this.dialog.open(ManageScheduleDialog, {
        data: {student, tutor: contacts[0], pendingMode},
        width: '520px',
      });
      ref.afterClosed().subscribe((updated?: Student) => {
        if (updated) {
          this.loadStudents(recomputeBilling ? () => this.recomputeCurrentPeriodBilling() : undefined);
        }
      });
    });
  }

  /**
   * After a mid-month package change, adjusts any already-generated billing
   * record for the current period to the recomputed (Option A) amount, keeping
   * its paid state. New periods aren't created here — the Billing page derives
   * those live.
   */
  private recomputeCurrentPeriodBilling(): void {
    const contact = this.loadedContact;
    if (!contact?.id) {
      return;
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const enrolled = this.students.filter(s =>
      s.status === StudentStatus.ACTIVE_STUDENT && (!!s.package || !!s.btc_and_me));
    const computed = currentPeriodAmounts(contact, enrolled, year, month);
    if (!computed) {
      return;
    }

    this.billingService.getBillingRecordsByContact(contact.id).pipe(
      catchError(error => {
        console.log(error);
        return of([] as BillingRecord[]);
      })
    ).subscribe(existing => {
      for (const record of recomputedBillingRecords(existing, contact.id!, computed, year, month)) {
        this.billingService.upsertBillingRecord(record).pipe(
          catchError(error => {
            console.log(error);
            return EMPTY;
          })
        ).subscribe();
      }
    });
  }

  deleteNoteAt(index: number) {
    const noteToDelete: Note = this.notes.controls.at(index)?.value as Note;
    if (this.newNoteIds.has(noteToDelete.id!)) {
      // Never persisted — nothing to delete server-side.
      this.newNoteIds.delete(noteToDelete.id!);
      this.notes.removeAt(index);
      this.notes.updateValueAndValidity();
      this.cdr.markForCheck();
      return;
    }
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

  /** Opens the Student dialog for create/edit/delete; reloads on a persisted change.
   *  A mid-month package change closes with a student id — after reloading we open
   *  Manage Schedule so the admin redefines the new package's slots, then recompute
   *  this period's billing. */
  openStudentDialog(mode: StudentDialogMode, student?: Student): void {
    // A BTC & Me enrollment change (edit or delete) reprices the current
    // month's already-generated billing record — snapshot to detect it.
    const groupFlagBefore = student?.btc_and_me ?? false;
    const editedId = student?.id;
    const ref = this.dialog.open(StudentDialog, {
      data: {mode, contactId: this.id, student, tutors: this.tutors},
      width: '480px',
    });
    ref.afterClosed().subscribe((result?: StudentDialogResult) => {
      if (!result) {
        return;
      }
      const openScheduleFor = typeof result === 'object' ? result.openScheduleForStudentId : undefined;
      const openPendingFor = typeof result === 'object' ? result.openPendingScheduleForStudentId : undefined;
      this.loadStudents(() => {
        if (openScheduleFor) {
          const changed = this.students.find(s => s.id === openScheduleFor);
          if (changed) {
            this.openManageScheduleDialog(changed, true);
          }
        }
        if (openPendingFor) {
          // Define the FUTURE package's slots; affects only pending_schedule,
          // so no billing recompute (the change bills a future month).
          const changed = this.students.find(s => s.id === openPendingFor);
          if (changed) {
            this.openManageScheduleDialog(changed, false, true);
          }
        }
        const groupFlagAfter = editedId
          ? (this.students.find(s => s.id === editedId)?.btc_and_me ?? false)
          : false;
        if (groupFlagAfter !== groupFlagBefore) {
          this.recomputeCurrentPeriodBilling();
        }
      });
    });
  }

  saveNoteAt(index: number) {
    const group = this.notes.controls.at(index)!;
    const raw = group.getRawValue() as Record<string, unknown>;
    const noteToSave: Note = {...raw, date_time: noteDateIso(raw['date_time'])} as Note;
    // Empty notes are never persisted — they'd render as blank cards forever.
    if (!(noteToSave.message ?? '').trim()) {
      this.noteEmptyError = true;
      this.cdr.markForCheck();
      return;
    }
    this.noteEmptyError = false;
    // A save that changed the note's date (incl. backdating a fresh note)
    // snaps the whole list back to newest-date-first — manual drag order is
    // a between-saves arrangement only (client decision 2026-08).
    const previousIso = this.noteEditSnapshot
      ? noteDateIso(this.noteEditSnapshot['date_time'])
      : null;
    const dateChanged = previousIso !== null && previousIso !== noteToSave.date_time;
    const isNew = this.newNoteIds.has(noteToSave.id!);
    this.noteSaveFailed = false;
    if (isNew) {
      // First persistence of a locally-created note — the server assigns the
      // real id, which replaces the local- placeholder in the form. The form
      // holds order as null in date-sort mode, but the schema rejects null —
      // it must be omitted entirely.
      const localId = noteToSave.id!;
      const {id: _localId, order, ...rest} = noteToSave;
      const createBody: Note = {...rest, ...(order != null ? {order} : {})};
      this.noteService.createNote(createBody)
        .pipe(
          catchError(error => {
            console.log(error);
            this.noteSaveFailed = true;
            this.cdr.markForCheck();
            return EMPTY;
          })
        )
        .subscribe(response => {
          group.get('id')!.setValue(response.id);
          this.newNoteIds.delete(localId);
          this.setNotesEditIndex(-1);
          if (dateChanged) {
            this.sortNotesByDate();
          }
          this.cdr.markForCheck();
        });
      return;
    }
    this.noteService.updateNote(noteToSave)
      .pipe(
        catchError(error => {
          console.log(error);
          this.noteSaveFailed = true;
          this.cdr.markForCheck();
          return EMPTY;
        })
      )
      .subscribe(note => {
        console.log(`Note ${note.id} updated successfully.`);
        this.setNotesEditIndex(-1);
        if (dateChanged) {
          this.sortNotesByDate();
        }
      });
  }

  /** Reorders notes via drag-and-drop: assigns a manual order to all and persists. */
  dropNote(event: CdkDragDrop<unknown>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const control = this.notes.at(event.previousIndex);
    this.notes.removeAt(event.previousIndex);
    this.notes.insert(event.currentIndex, control);
    this.notes.controls.forEach((c, i) => c.get('order')!.setValue(i));
    this.persistNoteOrder();
    this.cdr.markForCheck();
  }

  /** Clears the manual order on every note and re-sorts the list by date. */
  sortNotesByDate(): void {
    this.notes.controls.forEach(c => c.get('order')!.setValue(null));
    this.persistNoteOrder(); // order: null → the backend removes it (date sort)
    const controls = [...this.notes.controls].sort(
      (a, b) => new Date(b.get('date_time')?.value ?? 0).getTime() - new Date(a.get('date_time')?.value ?? 0).getTime(),
    );
    this.notes.clear();
    controls.forEach(c => this.notes.push(c));
    this.cdr.markForCheck();
  }

  /** Persists every note's current order (used after a drag or a date-sort reset). */
  private persistNoteOrder(): void {
    this.notes.controls.forEach(control => {
      const raw = control.getRawValue() as Record<string, unknown>;
      const note: Note = {...raw, date_time: noteDateIso(raw['date_time'])} as Note;
      if (this.newNoteIds.has(note.id!)) {
        // An unsaved local note must never be PUT — it doesn't exist server-side.
        return;
      }
      this.noteService.updateNote(note).pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      ).subscribe();
    });
  }

  addNote() {
    // Purely local until saved — persisting on + used to strand permanent
    // blank notes whenever the editor was abandoned (reload/navigation).
    const dateString = new Date().toISOString();
    const author = this.authService.contact().first_name;
    const authorId = this.authService.contact().id;
    const recipient = this.contactForm.controls['first_name'].value;
    const recipientId = this.contactForm.controls['id'].value;
    // In manual-order mode a new note goes to the top (lowest order); otherwise
    // its default "now" date_time already sorts it to the top.
    const order = this.notesHaveManualOrder
      ? minNoteOrder(this.notes.controls.map(c => c.get('order')?.value as number)) - 1
      : undefined;
    const localId = `local-${crypto.randomUUID()}`;
    const note: Note = {
      id: localId,
      date_time: dateString,
      author,
      author_id: authorId,
      recipient,
      recipient_id: recipientId,
      type: '',
      order,
    };
    this.notes.insert(0, noteGroup(this.formBuilder, note));
    this.notes.updateValueAndValidity();
    this.newNoteIds.add(localId);
    this.setNotesEditIndex(0);
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
      // Never bail silently — legacy records (e.g. 9-digit phones) load
      // invalid, and the admin needs to see WHY the save is refusing.
      this.contactForm.markAllAsTouched();
      this.updateInvalid = true;
      this.cdr.markForCheck();
      return;
    }
    this.updateInvalid = false;
    const contact: _Contact = this.contactForm.value as _Contact;
    // If the group changed on a contact that already has an account, Cognito
    // must be updated too. Doing it first means a Cognito failure aborts the
    // save, so the contact record can't drift ahead of the actual group.
    const accountExists = this.loadedContact?.user_profile_created ?? false;
    const groupChanged =
      accountExists && !!contact.email && contact.user_group !== this.loadedContact?.user_group;
    // Captured before loadedContact is reassigned below: a deactivating
    // parent-status change cascades onto the family's students after the save.
    const statusChanged = contact.status !== this.loadedContact?.status;
    const cascadeTarget =
      statusChanged && contact.service === Service.TUTORING
        ? cascadeTargetFor(contact.status)
        : null;
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
        if (cascadeTarget) {
          this.cascadeStatusToStudents(cascadeTarget);
        }
        this.cdr.markForCheck();
        setTimeout(() => {
          this.updatedSuccessfully = false;
          this.cdr.markForCheck();
        }, 1000);
      });
  }

  /**
   * Applies a deactivating parent-status change to every student in the
   * family (partial updates — the backend preserves untouched fields), then
   * refreshes the students list. Students already at the target are skipped.
   */
  private cascadeStatusToStudents(target: StudentStatus): void {
    const pending = this.students.filter(s => !!s.id && s.status !== target);
    if (pending.length === 0) {
      return;
    }
    forkJoin(
      pending.map(s =>
        this.studentService
          .updateStudent({
            id: s.id,
            contact_id: s.contact_id,
            name: s.name,
            status: target,
          } as Student)
          .pipe(
            catchError(error => {
              console.log(error);
              return of(null);
            }),
          ),
      ),
    )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadStudents();
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

  getTutorName(id?: string): string {
    if (!id) return '—';
    const tutor = this.staffById.get(id);
    // Never fall back to the raw id — an unresolved name renders as a dash
    // until the staff list (or the per-id fetch) supplies it.
    return tutor ? `${tutor.first_name} ${tutor.last_name}`.trim() : '—';
  }

}
