import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { ContactsTable } from './contacts-table';
import { ContactService } from '../services/contact.service';
import { AuthService } from '../services/auth.service';
import { ContactDialog } from '../contact-dialog/contact-dialog';
import { DeleteContactDialog } from '../delete-contact-dialog/delete-contact-dialog';
import { BatchNoteDialog } from '../batch-note-dialog/batch-note-dialog';
import { NoteService } from '../services/note.service';
import { Contact } from '../models/contact.model';

const contact = (id: string): Contact => ({ id, first_name: id }) as Contact;

describe('ContactsTable', () => {
  let isAdmin: boolean;
  let afterClosed: unknown;
  const contactService = { getContacts: jest.fn(), getContactsSummary: jest.fn() };
  const noteService = { createNote: jest.fn() };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: 'admin-me', first_name: 'Admin' }),
  };
  const router = { navigate: jest.fn() };
  const dialog = {
    open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })),
  };
  const snackBar = { open: jest.fn() };

  const build = (): ContactsTable => {
    TestBed.configureTestingModule({
      imports: [ContactsTable],
      providers: [
        { provide: ContactService, useValue: contactService },
        { provide: NoteService, useValue: noteService },
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: MatDialog, useValue: dialog },
        { provide: MatSnackBar, useValue: snackBar },
      ],
    });
    return TestBed.createComponent(ContactsTable).componentInstance;
  };

  const data = (c: ContactsTable) => c.dataSource;

  beforeEach(() => {
    isAdmin = true;
    afterClosed = undefined;
    sessionStorage.clear();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('loads contacts for an admin on init', () => {
    contactService.getContactsSummary.mockReturnValue(of([contact('c-1')]));
    const c = build();
    c.ngOnInit();
    expect(data(c).data).toEqual([contact('c-1')]);
  });

  it('does not load contacts for a non-admin', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(contactService.getContactsSummary).not.toHaveBeenCalled();
  });

  it('wires sort and paginator through the view-child setters', () => {
    const c = build();
    const sort = {} as MatSort;
    const paginator = {} as MatPaginator;
    c.matSort = sort;
    c.matPaginator = paginator;
    expect(data(c).sort).toBe(sort);
    expect(data(c).paginator).toBe(paginator);
  });


  it('view-child setters ignore null while the table is hidden', () => {
    const c = build();
    c.matSort = null as never;
    c.matPaginator = null as never;
    expect(c.dataSource.sort).toBeFalsy();
    expect(c.dataSource.paginator).toBeFalsy();
  });

  it('shows the spinner until contacts load', () => {
    contactService.getContactsSummary.mockReturnValue(of([]));
    const c = build();
    expect(c.loading).toBe(true);
    c.ngOnInit();
    expect(c.loading).toBe(false);
  });

  it('clears the spinner when loading fails', () => {
    contactService.getContactsSummary.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    expect(c.loading).toBe(false);
  });

  it('clears the spinner for a non-admin without fetching', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(c.loading).toBe(false);
    expect(contactService.getContactsSummary).not.toHaveBeenCalled();
  });

  it('applyFilter matches name, email, phone and service case-insensitively', () => {
    const c = build();
    c.ngOnInit();
    (c as any).dataSource.data = [
      { first_name: 'Ada', last_name: 'Lovelace', email: 'ada@x.com', phone_number: '5551234567', service: 'Tutoring' },
      { first_name: 'Sam', last_name: 'Roe', email: 'sam@y.com', phone_number: '5559876543', service: 'Hiring' },
    ];
    c.applyFilter('ADA');
    expect((c as any).dataSource.filteredData).toHaveLength(1);
    expect((c as any).dataSource.filteredData[0].first_name).toBe('Ada');
    c.applyFilter('hiring');
    expect((c as any).dataSource.filteredData[0].first_name).toBe('Sam');
    c.applyFilter('555');
    expect((c as any).dataSource.filteredData).toHaveLength(2);
    c.applyFilter('  ');
    expect((c as any).dataSource.filteredData).toHaveLength(2);
  });

  describe('copy filtered emails', () => {
    let writeText: jest.Mock;

    beforeEach(() => {
      writeText = jest.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      snackBar.open.mockClear();
    });

    const seed = (rows: Partial<Contact>[]): ContactsTable => {
      contactService.getContactsSummary.mockReturnValue(of(rows as Contact[]));
      const c = build();
      c.ngOnInit();
      return c;
    };

    it('copies deduped, comma-separated emails of the filtered rows', async () => {
      const c = seed([
        { first_name: 'Ada', email: 'ada@x.com' },
        { first_name: 'Dupe', email: 'ADA@x.com ' }, // case/space dupe
        { first_name: 'Sam', email: 'sam@y.com' },
        { first_name: 'NoMail' },
      ]);
      (c as any).copyFilteredEmails();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('ada@x.com, sam@y.com');
      expect(snackBar.open).toHaveBeenCalledWith(
        '2 emails copied (1 contact without an email)', undefined, { duration: 4000 });
    });

    it('skips contacts flagged exclude_bulk_email and reports the count', async () => {
      const c = seed([
        { first_name: 'Ada', email: 'ada@x.com' },
        { first_name: 'OptOut', email: 'optout@x.com', exclude_bulk_email: true },
        { first_name: 'NoMail' },
      ]);
      (c as any).copyFilteredEmails();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('ada@x.com');
      expect(snackBar.open).toHaveBeenCalledWith(
        '1 email copied (1 contact without an email; 1 excluded from bulk email)',
        undefined, { duration: 4000 });
    });

    it('an all-excluded view copies nothing', () => {
      const c = seed([
        { first_name: 'OptOut', email: 'optout@x.com', exclude_bulk_email: true },
      ]);
      (c as any).copyFilteredEmails();
      expect(writeText).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith(
        'No emails to copy in the current view.', undefined, { duration: 4000 });
    });

    it('respects the active filters (copies filteredData, not all rows)', async () => {
      const c = seed([
        { first_name: 'Ada', email: 'ada@x.com', service: 'Tutoring' },
        { first_name: 'Tess', email: 'tess@y.com', service: 'Hiring' },
      ]);
      c.onServiceFilterChange(['Hiring']);
      (c as any).copyFilteredEmails();
      await Promise.resolve();
      expect(writeText).toHaveBeenCalledWith('tess@y.com');
      expect(snackBar.open).toHaveBeenCalledWith('1 email copied', undefined, { duration: 4000 });
    });

    it('reports when nothing is copyable without touching the clipboard', () => {
      const c = seed([{ first_name: 'NoMail' }]);
      (c as any).copyFilteredEmails();
      expect(writeText).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith(
        'No emails to copy in the current view.', undefined, { duration: 4000 });
    });

    it('surfaces a clipboard failure', async () => {
      writeText.mockRejectedValue(new Error('denied'));
      const c = seed([{ first_name: 'Ada', email: 'ada@x.com' }]);
      (c as any).copyFilteredEmails();
      await Promise.resolve();
      await Promise.resolve();
      expect(snackBar.open).toHaveBeenCalledWith(
        'Could not copy to the clipboard.', undefined, { duration: 4000 });
    });
  });

  describe('service + status filters', () => {
    const rows = [
      { first_name: 'Ada', service: 'Tutoring', status: 'Active Client', scholarship_student: true },
      { first_name: 'Legacy', service: 'Tutoring', status: 'Past Student' },
      { first_name: 'Tess', service: 'Hiring', status: 'Staff' },
      { first_name: 'Newsy', service: 'Newsletter' },
    ] as Contact[];

    const seeded = (): ContactsTable => {
      contactService.getContactsSummary.mockReturnValue(of(rows));
      const c = build();
      c.ngOnInit();
      return c;
    };

    const names = (c: ContactsTable) =>
      (c as any).dataSource.filteredData.map((r: Contact) => r.first_name);

    it('filters by service', () => {
      const c = seeded();
      c.onServiceFilterChange(['Hiring']);
      expect(names(c)).toEqual(['Tess']);
      c.onServiceFilterChange(['Tutoring', 'Newsletter']);
      expect(names(c)).toEqual(['Ada', 'Legacy', 'Newsy']);
      c.onServiceFilterChange([]);
      expect(names(c)).toHaveLength(4);
    });

    it('filters by DISPLAY status: legacy values and staff labels match their chips', () => {
      const c = seeded();
      // 'Past Student' on a parent displays (and filters) as Former Client.
      c.onStatusFilterChange(['Former Client']);
      expect(names(c)).toEqual(['Legacy']);
      // Stored 'Staff' displays as Active Staff.
      c.onStatusFilterChange(['Active Staff']);
      expect(names(c)).toEqual(['Tess']);
    });

    it('combines text, service, and status (all must match)', () => {
      const c = seeded();
      c.onServiceFilterChange(['Tutoring']);
      c.applyFilter('ada');
      expect(names(c)).toEqual(['Ada']);
      c.onStatusFilterChange(['Former Client']);
      expect(names(c)).toEqual([]); // Ada is Active Client
    });

    it('filters scholarship families in or out (tri-state)', () => {
      const c = seeded();
      c.onScholarshipFilterChange('yes');
      expect(names(c)).toEqual(['Ada']);
      c.onScholarshipFilterChange('no');
      expect(names(c)).toEqual(['Legacy', 'Tess', 'Newsy']);
      c.onScholarshipFilterChange('');
      expect(names(c)).toHaveLength(4);
    });

    it('scholarship combines with the other filters', () => {
      const c = seeded();
      c.onServiceFilterChange(['Tutoring']);
      c.onScholarshipFilterChange('no');
      expect(names(c)).toEqual(['Legacy']);
    });

    it('persists filters for the session and restores them on rebuild', () => {
      const c = seeded();
      c.onServiceFilterChange(['Hiring']);
      c.applyFilter('tess');

      TestBed.resetTestingModule();
      const c2 = seeded();
      expect((c2 as any).serviceFilter).toEqual(['Hiring']);
      expect((c2 as any).searchText).toBe('tess');
      expect(names(c2)).toEqual(['Tess']);
    });

    it('persists and restores the scholarship filter (invalid values reset to All)', () => {
      const c = seeded();
      c.onScholarshipFilterChange('yes');

      TestBed.resetTestingModule();
      const c2 = seeded();
      expect((c2 as any).scholarshipFilter).toBe('yes');
      expect(names(c2)).toEqual(['Ada']);

      sessionStorage.setItem('btc-contacts-filters', JSON.stringify({ scholarship: 'bogus' }));
      TestBed.resetTestingModule();
      const c3 = seeded();
      expect((c3 as any).scholarshipFilter).toBe('');
      expect(names(c3)).toHaveLength(4);
    });

    it('starts unfiltered when saved state is corrupt', () => {
      sessionStorage.setItem('btc-contacts-filters', '{not json');
      const c = seeded();
      expect(names(c)).toHaveLength(4);
    });
  });

  describe('batch note to filtered contacts', () => {
    const seed = (rows: Partial<Contact>[]): ContactsTable => {
      contactService.getContactsSummary.mockReturnValue(of(rows as Contact[]));
      const c = build();
      c.ngOnInit();
      return c;
    };

    beforeEach(() => {
      snackBar.open.mockClear();
      dialog.open.mockClear();
      noteService.createNote.mockReset();
      noteService.createNote.mockReturnValue(of({ id: 'n-1' }));
    });

    it('creates the note for every filtered contact and reports the count', () => {
      afterClosed = 'Reminder: turn in your timesheets';
      const c = seed([
        { id: 'c-1', first_name: 'Ada', service: 'Hiring' },
        { id: 'c-2', first_name: 'Tess', service: 'Hiring' },
        { id: 'c-3', first_name: 'Jane', service: 'Tutoring' },
      ]);
      c.onServiceFilterChange(['Hiring']);
      (c as any).openBatchNoteDialog();
      expect(dialog.open).toHaveBeenCalledWith(BatchNoteDialog, expect.objectContaining({
        data: { count: 2 },
      }));
      expect(noteService.createNote).toHaveBeenCalledTimes(2);
      const notes = noteService.createNote.mock.calls.map(call => call[0]);
      expect(notes.map(n => n.recipient_id)).toEqual(['c-1', 'c-2']);
      expect(notes[0]).toEqual(expect.objectContaining({
        message: 'Reminder: turn in your timesheets',
        author: 'Admin',
        author_id: 'admin-me',
        recipient: 'Ada',
        type: '',
      }));
      expect(notes[0]).not.toHaveProperty('order');
      expect(snackBar.open).toHaveBeenCalledWith('Note added to 2 contacts', undefined, { duration: 5000 });
    });

    it('counts per-contact failures without aborting the batch', () => {
      afterClosed = 'hello';
      noteService.createNote
        .mockReturnValueOnce(of({ id: 'n-1' }))
        .mockReturnValueOnce(throwError(() => new Error('x')))
        .mockReturnValueOnce(of({ id: 'n-3' }));
      const c = seed([
        { id: 'c-1', first_name: 'A' },
        { id: 'c-2', first_name: 'B' },
        { id: 'c-3', first_name: 'C' },
      ]);
      (c as any).openBatchNoteDialog();
      expect(noteService.createNote).toHaveBeenCalledTimes(3);
      expect(snackBar.open).toHaveBeenCalledWith('Note added to 2 contacts (1 failed)', undefined, { duration: 5000 });
    });

    it('a cancelled dialog creates nothing', () => {
      afterClosed = null;
      const c = seed([{ id: 'c-1', first_name: 'A' }]);
      (c as any).openBatchNoteDialog();
      expect(noteService.createNote).not.toHaveBeenCalled();
    });

    it('an empty filtered view never opens the dialog', () => {
      const c = seed([{ id: 'c-1', first_name: 'Ada' }]);
      c.applyFilter('zzz-no-match');
      (c as any).openBatchNoteDialog();
      expect(dialog.open).not.toHaveBeenCalled();
      expect(snackBar.open).toHaveBeenCalledWith('No contacts in the current view.', undefined, { duration: 4000 });
    });
  });

  it('navigates to a newly created contact after the dialog closes', () => {
    afterClosed = { id: 'new-1' };
    const c = build();
    (c as unknown as { openContactDialog: () => void }).openContactDialog();
    expect(dialog.open).toHaveBeenCalledWith(ContactDialog, expect.any(Object));
    expect(router.navigate).toHaveBeenCalledWith(['/contacts', 'new-1']);
  });

  it('does not navigate when the create dialog is dismissed', () => {
    afterClosed = undefined;
    const c = build();
    (c as unknown as { openContactDialog: () => void }).openContactDialog();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('navigates when a contact row is clicked', () => {
    const c = build();
    (c as unknown as { contactClicked: (x: Contact) => void }).contactClicked(
      contact('c-9'),
    );
    expect(router.navigate).toHaveBeenCalledWith(['/contacts', 'c-9']);
  });

  it('removes a contact from the table when the delete dialog confirms', () => {
    afterClosed = true;
    const c = build();
    c.dataSource.data = [contact('c-1'), contact('c-2')];
    (c as unknown as { openDeleteDialog: (x: Contact) => void }).openDeleteDialog(
      contact('c-1'),
    );
    expect(dialog.open).toHaveBeenCalledWith(DeleteContactDialog, {
      data: contact('c-1'),
      width: '420px',
    });
    expect(c.dataSource.data).toEqual([contact('c-2')]);
  });

  it('keeps the row when the delete dialog is cancelled', () => {
    afterClosed = false;
    const c = build();
    c.dataSource.data = [contact('c-1')];
    (c as unknown as { openDeleteDialog: (x: Contact) => void }).openDeleteDialog(
      contact('c-1'),
    );
    expect(c.dataSource.data).toEqual([contact('c-1')]);
  });

  it('includes the status column and searches it by label', () => {
    const component = build();
    component.ngOnInit();
    expect((component as unknown as { contactColumns: string[] }).contactColumns)
      .toContain('status');
    // The predicate reads component state now — drive it through applyFilter.
    component.dataSource.data = [
      { first_name: 'Tess', status: 'Staff' },
      { first_name: 'Ada', status: 'Declined Services' },
      { first_name: 'Blank' },
    ] as Contact[];
    const names = () => component.dataSource.filteredData.map(r => r.first_name);
    // Matches both the stored value and the display label.
    component.applyFilter('staff');
    expect(names()).toEqual(['Tess']);
    component.applyFilter('active staff');
    expect(names()).toEqual(['Tess']);
    component.applyFilter('declined');
    expect(names()).toEqual(['Ada']);
  });

  it('statusLabel maps legacy parent statuses and labels staff statuses', () => {
    const c = build();
    expect((c as any).statusLabel({ service: 'Tutoring', status: 'Past Student' })).toBe('Former Client');
    expect((c as any).statusLabel({ service: 'Tutoring', status: 'Onboarding' })).toBe('MIA');
    expect((c as any).statusLabel({ service: 'Tutoring', status: 'Active Client' })).toBe('Active Client');
    // Staff keep the label machinery ('Staff' displays as 'Active Staff') and
    // their VALID 'Onboarding' status untouched.
    expect((c as any).statusLabel({ service: 'Hiring', status: 'Staff' })).toBe('Active Staff');
    expect((c as any).statusLabel({ service: 'Hiring', status: 'Onboarding' })).toBe('Onboarding');
    expect((c as any).statusLabel({ service: 'Hiring' })).toBe('');
  });
});
