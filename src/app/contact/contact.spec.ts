import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { FormArray, FormGroup } from '@angular/forms';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSelectChange } from '@angular/material/select';
import { Contact } from './contact';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { NoteService } from '../services/note.service';
import { AuthService } from '../services/auth.service';
import { Contact as ContactModel } from '../models/contact.model';
import { Student } from '../models/student.model';
import { Note } from '../models/note.model';
import { StudentSessionsDialog } from '../student-sessions-dialog/student-sessions-dialog';
import { DeleteContactDialog } from '../delete-contact-dialog/delete-contact-dialog';
import { Service } from '../enums/service.enum';
import { Status } from '../enums/status.enum';
import { Package } from '../enums/package.enum';

const fullContact = (over: Partial<ContactModel> = {}): ContactModel =>
  ({
    id: 'c-1',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    phone_number: '1234567890',
    service: Service.TUTORING,
    status: Status.ACTIVE_STUDENT,
    user_group: '',
    user_profile_created: false,
    availability: [{ days: ['MONDAY'], start_time: '09:00', end_time: '10:00' }],
    ...over,
  }) as ContactModel;

describe('Contact', () => {
  let isAdmin: boolean;
  let afterClosed: unknown;
  const contactService = {
    getContact: jest.fn(),
    getContacts: jest.fn(),
    updateContact: jest.fn(),
    adminCreateUser: jest.fn(),
    adminDeleteUser: jest.fn(),
  };
  const studentService = {
    getStudentsByContact: jest.fn(),
    getStudentsByTutor: jest.fn(),
    createStudent: jest.fn(),
    updateStudent: jest.fn(),
    deleteStudent: jest.fn(),
  };
  const noteService = {
    getNotesByRecipient: jest.fn(),
    createNote: jest.fn(),
    updateNote: jest.fn(),
    deleteNote: jest.fn(),
  };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: 'me', first_name: 'Admin' }),
  };
  const dialog = { open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })) };
  const router = { navigate: jest.fn() };

  const defaults = () => {
    contactService.getContact.mockReturnValue(of([fullContact()]));
    contactService.getContacts.mockReturnValue(of([]));
    studentService.getStudentsByContact.mockReturnValue(of([]));
    studentService.getStudentsByTutor.mockReturnValue(of([]));
    noteService.getNotesByRecipient.mockReturnValue(of([]));
  };

  const build = (id = 'c-1'): Contact => {
    TestBed.configureTestingModule({
      imports: [Contact],
      providers: [
        { provide: ContactService, useValue: contactService },
        { provide: StudentService, useValue: studentService },
        { provide: NoteService, useValue: noteService },
        { provide: AuthService, useValue: authService },
        { provide: MatDialog, useValue: dialog },
        { provide: Router, useValue: router },
      ],
    });
    const c = TestBed.createComponent(Contact).componentInstance;
    c.id = id;
    return c;
  };

  const form = (c: Contact): FormGroup =>
    (c as unknown as { contactForm: FormGroup }).contactForm;
  const notes = (c: Contact): FormArray =>
    (c as unknown as { notes: FormArray }).notes;
  const students = (c: Contact): FormArray =>
    (c as unknown as { students: FormArray }).students;

  beforeEach(() => {
    isAdmin = true;
    afterClosed = false;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    defaults();
  });

  it('loads contact, students, notes, tutors and roster on init', () => {
    contactService.getContacts.mockReturnValue(
      of([
        {
          id: 't-1',
          first_name: 'Tess',
          last_name: 'Coach',
          status: Status.STAFF,
          currently_accepting_students: true,
          service: Service.HIRING,
        },
        { id: 't-2', status: Status.ACTIVE_STUDENT }, // filtered out
      ]),
    );
    studentService.getStudentsByContact.mockReturnValue(
      of([{ id: 's-1', contact_id: 'c-1', name: 'Pat', status: Status.ACTIVE_STUDENT }]),
    );
    studentService.getStudentsByTutor.mockReturnValue(of([{ id: 's-9' }]));
    noteService.getNotesByRecipient.mockReturnValue(
      of([
        { id: 'n-1', date_time: '2026-01-01T00:00:00Z' },
        { id: 'n-2', date_time: '2026-02-01T00:00:00Z' },
      ]),
    );

    const c = build();
    c.ngOnInit();

    expect(form(c).controls['first_name'].value).toBe('Ada');
    expect(students(c).length).toBe(1);
    // Notes sorted newest-first.
    expect(notes(c).at(0).value.id).toBe('n-2');
    expect((c as unknown as { tutors: unknown[] }).tutors).toHaveLength(1);
    expect(
      (c as unknown as { rosterDataSource: { data: unknown[] } }).rosterDataSource.data,
    ).toHaveLength(1);
  });

  it('disables restricted fields for a non-admin', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(form(c).controls['service'].disabled).toBe(true);
    expect(form(c).controls['user_group'].disabled).toBe(true);
  });

  it('swallows a contact load error', () => {
    contactService.getContact.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    expect(() => c.ngOnInit()).not.toThrow();
  });

  describe('availability blocks', () => {
    it('adds and removes blocks', () => {
      const c = build();
      const blocks = (c as unknown as { availabilityBlocks: FormArray }).availabilityBlocks;
      c.addAvailabilityBlock();
      expect(blocks.length).toBe(1);
      expect(form(c).dirty).toBe(true);
      c.removeAvailabilityBlockAt(0);
      expect(blocks.length).toBe(0);
    });

    it('builds half-hour time options from 6am to 9pm', () => {
      const c = build();
      const options = (c as unknown as { timeOptions: { value: string; label: string }[] }).timeOptions;
      expect(options[0]).toEqual({ value: '06:00', label: '6:00 AM' });
      expect(options.at(-1)).toEqual({ value: '21:00', label: '9:00 PM' });
    });
  });

  describe('notes', () => {
    const seedNote = (c: Contact) => {
      noteService.getNotesByRecipient.mockReturnValue(
        of([{ id: 'n-1', message: 'hi' } as Note]),
      );
      c.ngOnInit();
    };

    it('sets the edit index', () => {
      const c = build();
      c.setNotesEditIndex(2);
      expect((c as unknown as { notesEditIndex: number }).notesEditIndex).toBe(2);
    });

    it('deletes a note', () => {
      const c = build();
      seedNote(c);
      noteService.deleteNote.mockReturnValue(of({ message: 'deleted' }));
      c.deleteNoteAt(0);
      expect(noteService.deleteNote).toHaveBeenCalledWith('n-1');
      expect(notes(c).length).toBe(0);
    });

    it('saves a note', () => {
      const c = build();
      seedNote(c);
      noteService.updateNote.mockReturnValue(of({ id: 'n-1' } as Note));
      c.saveNoteAt(0);
      expect(noteService.updateNote).toHaveBeenCalled();
      expect((c as unknown as { notesEditIndex: number }).notesEditIndex).toBe(-1);
    });

    it('adds a note at the top and opens it for editing', () => {
      const c = build();
      c.ngOnInit();
      noteService.createNote.mockReturnValue(of({ id: 'n-new', message: 'm' }));
      c.addNote();
      expect(noteService.createNote).toHaveBeenCalled();
      expect(notes(c).at(0).value.id).toBe('n-new');
      expect((c as unknown as { notesEditIndex: number }).notesEditIndex).toBe(0);
    });
  });

  describe('students', () => {
    const seedStudent = (c: Contact) => {
      studentService.getStudentsByContact.mockReturnValue(
        of([{ id: 's-1', contact_id: 'c-1', name: 'Pat', status: Status.ACTIVE_STUDENT }]),
      );
      c.ngOnInit();
    };

    it('sets the edit index', () => {
      const c = build();
      c.setStudentsEditIndex(1);
      expect((c as unknown as { studentsEditIndex: number }).studentsEditIndex).toBe(1);
    });

    it('deletes a student', () => {
      const c = build();
      seedStudent(c);
      studentService.deleteStudent.mockReturnValue(of({ message: 'deleted' }));
      c.deleteStudentAt(0);
      expect(studentService.deleteStudent).toHaveBeenCalledWith('s-1');
      expect(students(c).length).toBe(0);
    });

    it('saves a student', () => {
      const c = build();
      seedStudent(c);
      studentService.updateStudent.mockReturnValue(of({ id: 's-1' } as Student));
      c.saveStudentAt(0);
      expect(studentService.updateStudent).toHaveBeenCalled();
    });

    it('adds a student and opens it for editing', () => {
      const c = build();
      c.ngOnInit();
      studentService.createStudent.mockReturnValue(of({ id: 's-new' }));
      c.addStudent();
      expect(studentService.createStudent).toHaveBeenCalled();
      expect(students(c).length).toBe(1);
      expect((c as unknown as { studentsEditIndex: number }).studentsEditIndex).toBe(0);
    });

    it('packageSelected sets available minutes from the package map', () => {
      const c = build();
      c.ngOnInit();
      studentService.createStudent.mockReturnValue(of({ id: 's-new' }));
      c.addStudent();
      c.packageSelected({ value: Package.POWER_UP } as MatSelectChange);
      expect(students(c).at(0).get('available_minutes')?.value).toBe(720);
    });
  });

  describe('account management', () => {
    it('creates an account when the email and group are set', () => {
      const c = build();
      c.ngOnInit();
      form(c).controls['user_group'].setValue('Tutors');
      contactService.adminCreateUser.mockReturnValue(of({ message: 'ok' }));
      c.createAccount();
      expect(contactService.adminCreateUser).toHaveBeenCalled();
      expect((c as unknown as { accountCreated: boolean }).accountCreated).toBe(true);
      expect(form(c).controls['user_profile_created'].value).toBe(true);
    });

    it('flags an error when the group is missing', () => {
      const c = build();
      c.ngOnInit();
      form(c).controls['user_group'].setValue('');
      c.createAccount();
      expect(contactService.adminCreateUser).not.toHaveBeenCalled();
      expect((c as unknown as { accountError: boolean }).accountError).toBe(true);
    });

    it('flags an error when account creation fails', () => {
      const c = build();
      c.ngOnInit();
      form(c).controls['user_group'].setValue('Tutors');
      contactService.adminCreateUser.mockReturnValue(throwError(() => new Error('x')));
      c.createAccount();
      expect((c as unknown as { accountError: boolean }).accountError).toBe(true);
      expect((c as unknown as { accountLoading: boolean }).accountLoading).toBe(false);
    });

    it('deletes an account', () => {
      const c = build();
      c.ngOnInit();
      contactService.adminDeleteUser.mockReturnValue(of({ message: 'ok' }));
      c.deleteAccount();
      expect(contactService.adminDeleteUser).toHaveBeenCalled();
      expect((c as unknown as { accountCreated: boolean }).accountCreated).toBe(false);
      expect(form(c).controls['user_profile_created'].value).toBe(false);
    });

    it('handles a delete-account error', () => {
      const c = build();
      c.ngOnInit();
      contactService.adminDeleteUser.mockReturnValue(throwError(() => new Error('x')));
      c.deleteAccount();
      expect((c as unknown as { accountLoading: boolean }).accountLoading).toBe(false);
    });
  });

  describe('updateContact', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('saves a valid form and flashes a success flag', () => {
      const c = build();
      c.ngOnInit();
      contactService.updateContact.mockReturnValue(of({} as ContactModel));
      c.updateContact();
      expect(contactService.updateContact).toHaveBeenCalled();
      expect((c as unknown as { updatedSuccessfully: boolean }).updatedSuccessfully).toBe(true);
      jest.advanceTimersByTime(1000);
      expect((c as unknown as { updatedSuccessfully: boolean }).updatedSuccessfully).toBe(false);
    });

    it('flashes an error flag on failure', () => {
      const c = build();
      c.ngOnInit();
      contactService.updateContact.mockReturnValue(throwError(() => new Error('x')));
      c.updateContact();
      expect((c as unknown as { updateError: boolean }).updateError).toBe(true);
      jest.advanceTimersByTime(1000);
      expect((c as unknown as { updateError: boolean }).updateError).toBe(false);
    });
  });

  describe('dialogs and helpers', () => {
    it('navigates away after a confirmed delete', () => {
      afterClosed = true;
      const c = build();
      c.ngOnInit();
      c.openDeleteDialog();
      expect(dialog.open).toHaveBeenCalledWith(DeleteContactDialog, expect.any(Object));
      expect(router.navigate).toHaveBeenCalledWith(['/contacts']);
    });

    it('stays put when the delete dialog is cancelled', () => {
      afterClosed = false;
      const c = build();
      c.ngOnInit();
      c.openDeleteDialog();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('opens the student sessions dialog', () => {
      const c = build();
      c.openSessionsDialog({ id: 's-1' } as Student);
      expect(dialog.open).toHaveBeenCalledWith(StudentSessionsDialog, {
        data: { id: 's-1' },
        width: '700px',
      });
    });

    it('resolves tutor names', () => {
      const c = build();
      (c as unknown as { tutors: unknown[] }).tutors = [
        { id: 't-1', first_name: 'Tess', last_name: 'Coach' },
      ];
      expect(c.getTutorName('')).toBe('—');
      expect(c.getTutorName('t-1')).toBe('Tess Coach');
      expect(c.getTutorName('unknown')).toBe('unknown');
    });

    it('wires the roster sort and paginator via the view-child setters', () => {
      const c = build();
      const ds = (c as unknown as { rosterDataSource: { sort: unknown; paginator: unknown } }).rosterDataSource;
      const sort = {} as never;
      const paginator = {} as never;
      (c as unknown as { rosterSort: unknown }).rosterSort = sort;
      (c as unknown as { rosterPaginator: unknown }).rosterPaginator = paginator;
      expect(ds.sort).toBe(sort);
      expect(ds.paginator).toBe(paginator);
      // Null setters are no-ops (the table is behind an @if).
      (c as unknown as { rosterSort: unknown }).rosterSort = undefined;
      (c as unknown as { rosterPaginator: unknown }).rosterPaginator = undefined;
      expect(ds.sort).toBe(sort);
    });

    it('handles a contact with no availability or account flag', () => {
      contactService.getContact.mockReturnValue(
        of([fullContact({ availability: undefined, user_profile_created: undefined })]),
      );
      const c = build();
      c.ngOnInit();
      expect(
        (c as unknown as { accountCreated: boolean }).accountCreated,
      ).toBe(false);
    });

    it('does not attempt to delete an account with an invalid email', () => {
      contactService.getContact.mockReturnValue(
        of([fullContact({ email: 'not-an-email' })]),
      );
      const c = build();
      c.ngOnInit();
      c.deleteAccount();
      expect(contactService.adminDeleteUser).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('swallows errors from every loader on init', () => {
      contactService.getContact.mockReturnValue(throwError(() => new Error('x')));
      contactService.getContacts.mockReturnValue(throwError(() => new Error('x')));
      studentService.getStudentsByContact.mockReturnValue(throwError(() => new Error('x')));
      studentService.getStudentsByTutor.mockReturnValue(throwError(() => new Error('x')));
      noteService.getNotesByRecipient.mockReturnValue(throwError(() => new Error('x')));
      const c = build();
      expect(() => c.ngOnInit()).not.toThrow();
    });

    it('swallows a note deletion error', () => {
      noteService.getNotesByRecipient.mockReturnValue(of([{ id: 'n-1' } as Note]));
      const c = build();
      c.ngOnInit();
      noteService.deleteNote.mockReturnValue(throwError(() => new Error('x')));
      c.deleteNoteAt(0);
      expect(notes(c).length).toBe(1); // not removed
    });

    it('swallows a student deletion error', () => {
      studentService.getStudentsByContact.mockReturnValue(
        of([{ id: 's-1', contact_id: 'c-1', name: 'Pat', status: Status.ACTIVE_STUDENT }]),
      );
      const c = build();
      c.ngOnInit();
      studentService.deleteStudent.mockReturnValue(throwError(() => new Error('x')));
      c.deleteStudentAt(0);
      expect(students(c).length).toBe(1);
    });

    it('swallows a note save error', () => {
      noteService.getNotesByRecipient.mockReturnValue(of([{ id: 'n-1' } as Note]));
      const c = build();
      c.ngOnInit();
      noteService.updateNote.mockReturnValue(throwError(() => new Error('x')));
      expect(() => c.saveNoteAt(0)).not.toThrow();
    });

    it('swallows a student save error', () => {
      studentService.getStudentsByContact.mockReturnValue(
        of([{ id: 's-1', contact_id: 'c-1', name: 'Pat', status: Status.ACTIVE_STUDENT }]),
      );
      const c = build();
      c.ngOnInit();
      studentService.updateStudent.mockReturnValue(throwError(() => new Error('x')));
      expect(() => c.saveStudentAt(0)).not.toThrow();
    });

    it('swallows an add-note error', () => {
      const c = build();
      c.ngOnInit();
      noteService.createNote.mockReturnValue(throwError(() => new Error('x')));
      c.addNote();
      expect(notes(c).length).toBe(0);
    });

    it('swallows an add-student error', () => {
      const c = build();
      c.ngOnInit();
      studentService.createStudent.mockReturnValue(throwError(() => new Error('x')));
      c.addStudent();
      expect(students(c).length).toBe(0);
    });

    it('sorts notes that are missing a timestamp', () => {
      noteService.getNotesByRecipient.mockReturnValue(
        of([
          { id: 'n-1' } as Note,
          { id: 'n-2', date_time: '2026-01-01' } as Note,
          { id: 'n-3' } as Note,
        ]),
      );
      const c = build();
      c.ngOnInit();
      expect(notes(c).length).toBe(3);
    });

    it('does not submit an invalid contact form', () => {
      const c = build(); // form starts invalid (required fields empty)
      c.updateContact();
      expect(contactService.updateContact).not.toHaveBeenCalled();
    });
  });
});
