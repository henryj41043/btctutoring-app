import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DeleteContactDialog } from './delete-contact-dialog';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { NoteService } from '../services/note.service';
import { DocumentService } from '../services/document.service';
import { AuthService } from '../services/auth.service';
import { Contact } from '../models/contact.model';

describe('DeleteContactDialog', () => {
  const dialogRef = { close: jest.fn() };
  const contactService = { adminDeleteUser: jest.fn(), deleteContact: jest.fn() };
  const studentService = { getStudentsByContact: jest.fn(), deleteStudent: jest.fn() };
  const noteService = { getNotesByRecipient: jest.fn(), deleteNote: jest.fn() };
  const authService = { contact: () => ({ id: 'me' }) };
  const documentService = { getDocumentsForContact: jest.fn(), deleteForContact: jest.fn() };

  beforeEach(() => {
    documentService.getDocumentsForContact.mockReturnValue(of([]));
    documentService.deleteForContact.mockReturnValue(of({ deleted: 0 }));
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
