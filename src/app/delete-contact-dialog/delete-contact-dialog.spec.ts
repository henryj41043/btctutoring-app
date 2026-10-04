import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DeleteContactDialog } from './delete-contact-dialog';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { NoteService } from '../services/note.service';
import { DocumentService } from '../services/document.service';
import { EmailService } from '../services/email.service';
import { ReminderService } from '../services/reminder.service';
import { ScholarshipService } from '../services/scholarship.service';
import { AuthService } from '../services/auth.service';
import { Contact } from '../models/contact.model';

describe('DeleteContactDialog', () => {
  const dialogRef = { close: jest.fn() };
  const contactService = { adminDeleteUser: jest.fn(), deleteContact: jest.fn() };
  const studentService = { getStudentsByContact: jest.fn(), deleteStudent: jest.fn() };
  const noteService = { getNotesByRecipient: jest.fn(), deleteNote: jest.fn() };
  const authService = { contact: () => ({ id: 'me' }) };
  const documentService = { getDocumentsForContact: jest.fn(), deleteForContact: jest.fn() };
  const emailService = { getEmailsForContact: jest.fn(), discardForContact: jest.fn() };
  const reminderService = { getReminders: jest.fn(), deleteForContact: jest.fn() };
  const scholarshipService = { getScholarshipRecordsByContact: jest.fn(), deleteForContact: jest.fn() };

  beforeEach(() => {
    documentService.getDocumentsForContact.mockReturnValue(of([]));
    documentService.deleteForContact.mockReturnValue(of({ deleted: 0 }));
    emailService.getEmailsForContact.mockReturnValue(of([]));
    emailService.discardForContact.mockReturnValue(of({ discarded: 0 }));
    reminderService.getReminders.mockReturnValue(of([]));
    reminderService.deleteForContact.mockReturnValue(of({ deleted: 0 }));
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([]));
    scholarshipService.deleteForContact.mockReturnValue(of({ deleted: 0 }));
  });

  const build = (contact: Partial<Contact>): DeleteContactDialog => {
    TestBed.configureTestingModule({
      imports: [DeleteContactDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: contact },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: ContactService, useValue: contactService },
        { provide: StudentService, useValue: studentService },
        { provide: NoteService, useValue: noteService },
        { provide: DocumentService, useValue: documentService },
        { provide: EmailService, useValue: emailService },
        { provide: ReminderService, useValue: reminderService },
        { provide: ScholarshipService, useValue: scholarshipService },
        { provide: AuthService, useValue: authService },
      ],
    });
    return TestBed.createComponent(DeleteContactDialog).componentInstance;
  };

  it('flags the dialog when deleting your own contact', () => {
    const component = build({ id: 'me' });
    expect((component as unknown as { isSelf: boolean }).isSelf).toBe(true);
  });

  it('shows the name, or the email for a name-less (newsletter) contact', () => {
    const named = build({ id: 'c-1', first_name: 'Ada', last_name: 'Lovelace' });
    expect((named as unknown as { displayName: string }).displayName).toBe('Ada Lovelace');
    TestBed.resetTestingModule();
    const nameless = build({ id: 'c-2', email: 'subscriber@example.com' });
    expect((nameless as unknown as { displayName: string }).displayName).toBe('subscriber@example.com');
  });

  describe('emails, reminders and scholarship records', () => {
    const text = (contact: Partial<Contact>): string | undefined => {
      build(contact);
      const fixture = TestBed.createComponent(DeleteContactDialog);
      fixture.detectChanges();
      return (fixture.nativeElement as HTMLElement).querySelector('.document-count')
        ?.textContent?.replace(/\s+/g, ' ').trim();
    };

    it('says what else the contact has, counting only reminders linked to them', () => {
      documentService.getDocumentsForContact.mockReturnValue(of([{ id: 'd-1' }, { id: 'd-2' }]));
      emailService.getEmailsForContact.mockReturnValue(of([{ id: 'e-1' }, { id: 'e-2' }, { id: 'e-3' }]));
      reminderService.getReminders.mockReturnValue(of([
        { id: 'r-1', contact_id: 'c-1' },
        { id: 'r-2', contact_id: 'c-other' },
        { id: 'r-3' },
      ]));
      scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([{ id: 's-1' }, { id: 's-2' }]));
      expect(text({ id: 'c-1' }))
        .toBe('This contact has 2 documents, 3 filed emails, 1 reminder and 2 scholarship records.');
      expect(emailService.getEmailsForContact).toHaveBeenCalledWith('c-1');
      expect(scholarshipService.getScholarshipRecordsByContact).toHaveBeenCalledWith('c-1');
    });

    it.each([
      [{ emails: [{ id: 'e-1' }] }, 'This contact has 1 filed email.'],
      [{ scholarships: [{ id: 's-1' }] }, 'This contact has 1 scholarship record.'],
      [{ emails: [{ id: 'e-1' }], scholarships: [{ id: 's-1' }, { id: 's-2' }] },
        'This contact has 1 filed email and 2 scholarship records.'],
    ])('lists only what there is', (has, expected) => {
      emailService.getEmailsForContact.mockReturnValue(of(has.emails ?? []));
      scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of(has.scholarships ?? []));
      expect(text({ id: 'c-1' })).toBe(expected);
    });

    it('treats a failed or empty read as zero and still shows the rest', () => {
      emailService.getEmailsForContact.mockReturnValue(throwError(() => new Error('boom')));
      reminderService.getReminders.mockReturnValue(of(null));
      documentService.getDocumentsForContact.mockReturnValue(of([{ id: 'd-1' }]));
      expect(text({ id: 'c-1' })).toBe('This contact has 1 document.');
    });

    it('removes them before the contact is deleted', () => {
      const order: string[] = [];
      const track = (name: string, value: unknown) => () => { order.push(name); return of(value); };
      studentService.getStudentsByContact.mockReturnValue(of([]));
      noteService.getNotesByRecipient.mockReturnValue(of([]));
      emailService.discardForContact.mockImplementation(track('emails', { discarded: 1 }));
      reminderService.deleteForContact.mockImplementation(track('reminders', { deleted: 1 }));
      scholarshipService.deleteForContact.mockImplementation(track('scholarships', { deleted: 1 }));
      contactService.deleteContact.mockImplementation(track('contact', { message: 'ok' }));
      dialogRef.close.mockClear();
      build({ id: 'c-1' }).confirm();
      expect(emailService.discardForContact).toHaveBeenCalledWith('c-1');
      expect(reminderService.deleteForContact).toHaveBeenCalledWith('c-1');
      expect(scholarshipService.deleteForContact).toHaveBeenCalledWith('c-1');
      expect(order).toEqual(['emails', 'reminders', 'scholarships', 'contact']);
      expect(dialogRef.close).toHaveBeenCalledWith(true);
    });

    it.each([
      ['emails', () => emailService.discardForContact],
      ['reminders', () => reminderService.deleteForContact],
      ['scholarship records', () => scholarshipService.deleteForContact],
    ])('keeps the contact when the %s cannot be removed', (_what, failing) => {
      studentService.getStudentsByContact.mockReturnValue(of([]));
      noteService.getNotesByRecipient.mockReturnValue(of([]));
      failing().mockReturnValue(throwError(() => new Error('boom')));
      contactService.deleteContact.mockClear();
      dialogRef.close.mockClear();
      const component = build({ id: 'c-1' });
      component.confirm();
      expect(contactService.deleteContact).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect((component as unknown as { error: string }).error)
        .toBe('Failed to delete the contact. Please try again.');
    });
  });

  describe('documents', () => {
    const render = (contact: Partial<Contact>): HTMLElement => {
      build(contact);
      const fixture = TestBed.createComponent(DeleteContactDialog);
      fixture.detectChanges();
      return fixture.nativeElement;
    };

    it.each([
      [[{ id: 'd-1' }], 'This contact has 1 document.'],
      [[{ id: 'd-1' }, { id: 'd-2' }], 'This contact has 2 documents.'],
    ])('says how many will be deleted', (documents, text) => {
      documentService.getDocumentsForContact.mockReturnValue(of(documents));
      const el = render({ id: 'c-1' });
      expect(documentService.getDocumentsForContact).toHaveBeenCalledWith('c-1');
      expect(el.querySelector('.document-count')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(text);
    });

    it('says nothing about a count when there are none, or when the count fails', () => {
      expect(render({ id: 'c-1' }).querySelector('.document-count')).toBeNull();
      TestBed.resetTestingModule();
      documentService.getDocumentsForContact.mockReturnValue(throwError(() => new Error('boom')));
      expect(render({ id: 'c-1' }).querySelector('.document-count')).toBeNull();
    });

    it('does not count for your own contact or one without an id', () => {
      documentService.getDocumentsForContact.mockClear();
      render({ id: 'me' });
      TestBed.resetTestingModule();
      render({});
      expect(documentService.getDocumentsForContact).not.toHaveBeenCalled();
    });

    it('are deleted before the contact', () => {
      const order: string[] = [];
      studentService.getStudentsByContact.mockReturnValue(of([]));
      noteService.getNotesByRecipient.mockReturnValue(of([]));
      documentService.deleteForContact.mockImplementation(() => {
        order.push('documents');
        return of({ deleted: 1 });
      });
      contactService.deleteContact.mockImplementation(() => {
        order.push('contact');
        return of({ message: 'ok' });
      });
      build({ id: 'c-1' }).confirm();
      expect(documentService.deleteForContact).toHaveBeenCalledWith('c-1');
      expect(order).toEqual(['documents', 'contact']);
    });

    it('keep the contact when they cannot be deleted', () => {
      studentService.getStudentsByContact.mockReturnValue(of([]));
      noteService.getNotesByRecipient.mockReturnValue(of([]));
      documentService.deleteForContact.mockReturnValue(throwError(() => new Error('boom')));
      contactService.deleteContact.mockClear();
      dialogRef.close.mockClear();
      const component = build({ id: 'c-1' });
      component.confirm();
      expect(contactService.deleteContact).not.toHaveBeenCalled();
      expect(dialogRef.close).not.toHaveBeenCalled();
      expect((component as unknown as { error: string }).error)
        .toBe('Failed to delete the contact. Please try again.');
    });
  });

  it('deletes a contact with no user account, students, or notes', () => {
    studentService.getStudentsByContact.mockReturnValue(of([]));
    noteService.getNotesByRecipient.mockReturnValue(of([]));
    contactService.deleteContact.mockReturnValue(of({ message: 'ok' }));

    const component = build({ id: 'c-1', user_profile_created: false });
    component.confirm();

    expect(contactService.adminDeleteUser).not.toHaveBeenCalled();
    expect(contactService.deleteContact).toHaveBeenCalledWith('c-1');
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('cascades through cognito, students, and notes before deleting the contact', () => {
    contactService.adminDeleteUser.mockReturnValue(
      of({ message: 'Deleted user successfully.' }),
    );
    studentService.getStudentsByContact.mockReturnValue(of([{ id: 's-1' }]));
    studentService.deleteStudent.mockReturnValue(of({ message: 'ok' }));
    noteService.getNotesByRecipient.mockReturnValue(of([{ id: 'n-1' }]));
    noteService.deleteNote.mockReturnValue(of({ message: 'ok' }));
    contactService.deleteContact.mockReturnValue(of({ message: 'ok' }));

    const component = build({
      id: 'c-1',
      email: 'a@b.com',
      user_profile_created: true,
    });
    component.confirm();

    expect(contactService.adminDeleteUser).toHaveBeenCalledWith('a@b.com');
    expect(studentService.deleteStudent).toHaveBeenCalledWith('s-1');
    expect(noteService.deleteNote).toHaveBeenCalledWith('n-1');
    expect(contactService.deleteContact).toHaveBeenCalledWith('c-1');
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('aborts and reports when the cognito delete is rejected', () => {
    contactService.adminDeleteUser.mockReturnValue(of({ message: 'nope' }));

    const component = build({
      id: 'c-1',
      email: 'a@b.com',
      user_profile_created: true,
    });
    component.confirm();

    expect(contactService.deleteContact).not.toHaveBeenCalled();
    expect((component as unknown as { error: string | null }).error).toBe(
      'Failed to delete the user account. The contact was not deleted.',
    );
    expect((component as unknown as { deleting: boolean }).deleting).toBe(false);
  });

  it('reports a generic error when the contact delete fails', () => {
    studentService.getStudentsByContact.mockReturnValue(of([]));
    noteService.getNotesByRecipient.mockReturnValue(of([]));
    contactService.deleteContact.mockReturnValue(
      throwError(() => new Error('boom')),
    );

    const component = build({ id: 'c-1', user_profile_created: false });
    component.confirm();

    expect((component as unknown as { error: string | null }).error).toBe(
      'Failed to delete the contact. Please try again.',
    );
    expect(dialogRef.close).not.toHaveBeenCalled();
  });
});
