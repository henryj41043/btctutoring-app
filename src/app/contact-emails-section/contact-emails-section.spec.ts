import { TestBed } from '@angular/core/testing';
import { concat, of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ContactEmailsSection } from './contact-emails-section';
import { EmailService } from '../services/email.service';
import { ContactService } from '../services/contact.service';
import { AuthService } from '../services/auth.service';
import { EmailEntry } from '../models/email-entry.model';

describe('ContactEmailsSection', () => {
  let isAdmin: boolean;
  let afterClosed: unknown;
  const emailService = { getEmailsForContact: jest.fn(), getOriginalUrl: jest.fn() };
  const contactService = { getContactsSummary: jest.fn() };
  const dialog = { open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })) };

  const build = (): ContactEmailsSection => {
    TestBed.configureTestingModule({
      imports: [ContactEmailsSection],
      providers: [
        { provide: EmailService, useValue: emailService },
        { provide: ContactService, useValue: contactService },
        { provide: AuthService, useValue: { isAdmin: () => isAdmin } },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    const c = TestBed.createComponent(ContactEmailsSection).componentInstance;
    c.contactId = 'c-1';
    return c;
  };

  const emails = (c: ContactEmailsSection): EmailEntry[] =>
    (c as unknown as { contactEmails: EmailEntry[] }).contactEmails;
  const expandedId = (c: ContactEmailsSection): string | null =>
    (c as unknown as { expandedEmailId: string | null }).expandedEmailId;

  const emailEntry: EmailEntry = {
    id: 'hash-1',
    subject: 'Schedule change',
    from_email: 'jane@example.com',
    body_text: 'Can we move to Friday?',
  };

  beforeEach(() => {
    isAdmin = true;
    afterClosed = undefined;
    dialog.open.mockClear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    emailService.getEmailsForContact.mockReturnValue(of([]));
    emailService.getOriginalUrl.mockReturnValue(of({ url: 'https://signed' }));
    contactService.getContactsSummary.mockReturnValue(of([
      { id: 'c-1', first_name: 'This', last_name: 'Page' },
      { id: 'c-2', first_name: 'Fam', last_name: 'Ily' },
    ]));
  });

  it('loads the filed emails for an admin', () => {
    emailService.getEmailsForContact.mockReturnValue(of([emailEntry]));
    const c = build();
    c.ngOnInit();
    expect(emailService.getEmailsForContact).toHaveBeenCalledWith('c-1');
    expect(emails(c)).toEqual([emailEntry]);
  });

  it('does not fetch emails for non-admins', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(emailService.getEmailsForContact).not.toHaveBeenCalled();
    expect(emails(c)).toEqual([]);
  });

  it('swallows an emails load error', () => {
    emailService.getEmailsForContact.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    expect(() => c.ngOnInit()).not.toThrow();
    expect(emails(c)).toEqual([]);
  });

  it('toggles a row open and closed', () => {
    const c = build();
    c.toggleEmail(emailEntry);
    expect(expandedId(c)).toBe('hash-1');
    c.toggleEmail(emailEntry);
    expect(expandedId(c)).toBeNull();
    c.toggleEmail({ ...emailEntry, id: undefined });
    expect(expandedId(c)).toBeNull();
  });

  it('view original opens the presigned url in a new tab', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const c = build();
    const event = { stopPropagation: jest.fn() } as unknown as Event;
    c.viewOriginalEmail(emailEntry, event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(emailService.getOriginalUrl).toHaveBeenCalledWith('hash-1');
    expect(open).toHaveBeenCalledWith('https://signed', '_blank');
    open.mockRestore();
  });

  it('remove opens the discard dialog and reloads the section on confirm', () => {
    afterClosed = true;
    const c = build();
    c.ngOnInit();
    emailService.getEmailsForContact.mockClear();
    const event = { stopPropagation: jest.fn() } as unknown as Event;
    c.removeEmail(emailEntry, event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ mode: 'discard', entry: emailEntry }) }),
    );
    expect(emailService.getEmailsForContact).toHaveBeenCalledWith('c-1');
  });

  it('a cancelled remove dialog does not reload', () => {
    afterClosed = false;
    const c = build();
    c.ngOnInit();
    emailService.getEmailsForContact.mockClear();
    c.removeEmail(emailEntry, { stopPropagation: jest.fn() } as unknown as Event);
    expect(emailService.getEmailsForContact).not.toHaveBeenCalled();
  });

  it('view original is a no-op without an id and swallows errors', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const c = build();
    c.viewOriginalEmail({ ...emailEntry, id: undefined }, { stopPropagation: jest.fn() } as unknown as Event);
    expect(emailService.getOriginalUrl).not.toHaveBeenCalled();
    emailService.getOriginalUrl.mockReturnValue(throwError(() => new Error('x')));
    expect(() =>
      c.viewOriginalEmail(emailEntry, { stopPropagation: jest.fn() } as unknown as Event),
    ).not.toThrow();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });

  describe('moveEmail', () => {
    it('opens the assign dialog with every contact except this page, reloads on success', () => {
      afterClosed = true;
      emailService.getEmailsForContact.mockReturnValue(of([emailEntry]));
      const c = build();
      c.ngOnInit();
      emailService.getEmailsForContact.mockClear();
      const event = { stopPropagation: jest.fn() } as unknown as Event;
      c.moveEmail(emailEntry, event);
      expect((event as unknown as { stopPropagation: jest.Mock }).stopPropagation).toHaveBeenCalled();
      const config = dialog.open.mock.calls.at(-1)![1] as {
        data: { mode: string; entry: EmailEntry; contacts: { id: string }[] };
      };
      expect(config.data.mode).toBe('assign');
      expect(config.data.entry).toBe(emailEntry);
      // Moving to the page it is already on would be a no-op.
      expect(config.data.contacts.map(contact => contact.id)).toEqual(['c-2']);
      expect(emailService.getEmailsForContact).toHaveBeenCalledTimes(1); // reload
    });

    it('does not reload when the dialog is dismissed', () => {
      afterClosed = undefined;
      const c = build();
      c.ngOnInit();
      emailService.getEmailsForContact.mockClear();
      c.moveEmail(emailEntry, { stopPropagation: jest.fn() } as unknown as Event);
      expect(emailService.getEmailsForContact).not.toHaveBeenCalled();
    });

    it('opens ONE dialog when the summary cache is warm (cached + fresh emissions)', () => {
      // getContactsSummary is stale-while-revalidate: with a warm cache it
      // emits twice. Regression: each emission opened its own stacked dialog.
      afterClosed = undefined;
      const contacts = [{id: 'c-2', first_name: 'Other'}];
      contactService.getContactsSummary.mockReturnValue(concat(of(contacts), of(contacts)));
      const c = build();
      c.ngOnInit();
      dialog.open.mockClear();
      c.moveEmail(emailEntry, { stopPropagation: jest.fn() } as unknown as Event);
      expect(dialog.open).toHaveBeenCalledTimes(1);
    });

    it('swallows a failed contacts load (no dialog opens)', () => {
      contactService.getContactsSummary.mockReturnValue(throwError(() => new Error('x')));
      const c = build();
      c.ngOnInit();
      dialog.open.mockClear();
      c.moveEmail(emailEntry, { stopPropagation: jest.fn() } as unknown as Event);
      expect(dialog.open).not.toHaveBeenCalled();
    });
  });
});
