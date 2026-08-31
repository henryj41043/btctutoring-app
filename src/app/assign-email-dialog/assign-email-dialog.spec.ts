import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AssignEmailDialog, AssignEmailDialogData } from './assign-email-dialog';
import { EmailService } from '../services/email.service';
import { EmailEntry } from '../models/email-entry.model';
import { Contact } from '../models/contact.model';

const entry: EmailEntry = { id: 'hash-1', subject: 'Hello' };
const contacts: Contact[] = [
  { id: 'c-z', first_name: 'Zoe', last_name: 'Young' } as Contact,
  { id: 'c-a', first_name: 'Ann', last_name: 'Lee' } as Contact,
  { id: 'c-e', first_name: '', last_name: '', email: 'only-email@example.com' } as Contact,
];

describe('AssignEmailDialog', () => {
  const emailService = { assign: jest.fn(), discard: jest.fn() };
  const dialogRef = { close: jest.fn() };

  const build = (data: Partial<AssignEmailDialogData> = {}): AssignEmailDialog => {
    TestBed.configureTestingModule({
      imports: [AssignEmailDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { mode: 'assign', entry, contacts, ...data } },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: EmailService, useValue: emailService },
      ],
    });
    return TestBed.createComponent(AssignEmailDialog).componentInstance;
  };

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    emailService.assign.mockReturnValue(of({}));
    emailService.discard.mockReturnValue(of({}));
  });

  it('sorts contacts by display name, falling back to email for nameless ones', () => {
    const c = build();
    const sorted = (c as unknown as { sortedContacts: Contact[] }).sortedContacts;
    expect(sorted.map(x => x.id)).toEqual(['c-a', 'c-e', 'c-z']);
    expect(c['contactName'](contacts[2])).toBe('only-email@example.com');
  });

  it('builds typeahead options: sorted labels with email fallback, id-less dropped', () => {
    const c = build({
      contacts: [...contacts, { first_name: 'NoId' } as Contact],
    });
    const opts = (c as unknown as { contactOptions: {value: string; label: string}[] }).contactOptions;
    expect(opts).toEqual([
      { value: 'c-a', label: 'Ann Lee' },
      { value: 'c-e', label: 'only-email@example.com' },
      { value: 'c-z', label: 'Zoe Young' },
    ]);
  });

  it('renders sparse contact records without crashing the name', () => {
    const c = build();
    expect(c['contactName']({ id: 'c-x' } as Contact)).toBe('');
    expect(c['contactName']({ id: 'c-y', first_name: 'Solo' } as Contact)).toBe('Solo');
    expect(c['contactName']({ id: 'c-w', last_name: 'Lastonly' } as Contact)).toBe('Lastonly');
  });

  it('assign requires a selected contact', () => {
    const c = build();
    c.confirm();
    expect(emailService.assign).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('assign calls the service and closes with true', () => {
    const c = build();
    (c as unknown as { selectedContactId: string }).selectedContactId = 'c-a';
    c.confirm();
    expect(emailService.assign).toHaveBeenCalledWith('hash-1', 'c-a');
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('discard calls the service and closes with true', () => {
    const c = build({ mode: 'discard' });
    c.confirm();
    expect(emailService.discard).toHaveBeenCalledWith('hash-1');
    expect(dialogRef.close).toHaveBeenCalledWith(true);
  });

  it('a failed request shows the error and keeps the dialog open', () => {
    emailService.discard.mockReturnValue(throwError(() => new Error('x')));
    const c = build({ mode: 'discard' });
    c.confirm();
    expect((c as unknown as { failed: boolean }).failed).toBe(true);
    expect((c as unknown as { working: boolean }).working).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('cancel closes with false', () => {
    const c = build();
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith(false);
  });
});
