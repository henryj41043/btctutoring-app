import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatSort } from '@angular/material/sort';
import { MatPaginator } from '@angular/material/paginator';
import { ContactsTable } from './contacts-table';
import { ContactService } from '../services/contact.service';
import { AuthService } from '../services/auth.service';
import { ContactDialog } from '../contact-dialog/contact-dialog';
import { DeleteContactDialog } from '../delete-contact-dialog/delete-contact-dialog';
import { Contact } from '../models/contact.model';

const contact = (id: string): Contact => ({ id, first_name: id }) as Contact;

describe('ContactsTable', () => {
  let isAdmin: boolean;
  let afterClosed: unknown;
  const contactService = { getContacts: jest.fn() };
  const authService = { isAdmin: () => isAdmin };
  const router = { navigate: jest.fn() };
  const dialog = {
    open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })),
  };

  const build = (): ContactsTable => {
    TestBed.configureTestingModule({
      imports: [ContactsTable],
      providers: [
        { provide: ContactService, useValue: contactService },
        { provide: AuthService, useValue: authService },
        { provide: Router, useValue: router },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    return TestBed.createComponent(ContactsTable).componentInstance;
  };

  const data = (c: ContactsTable) => c.dataSource;

  beforeEach(() => {
    isAdmin = true;
    afterClosed = undefined;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('loads contacts for an admin on init', () => {
    contactService.getContacts.mockReturnValue(of([contact('c-1')]));
    const c = build();
    c.ngOnInit();
    expect(data(c).data).toEqual([contact('c-1')]);
  });

  it('does not load contacts for a non-admin', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(contactService.getContacts).not.toHaveBeenCalled();
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
    contactService.getContacts.mockReturnValue(of([]));
    const c = build();
    expect(c.loading).toBe(true);
    c.ngOnInit();
    expect(c.loading).toBe(false);
  });

  it('clears the spinner when loading fails', () => {
    contactService.getContacts.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    expect(c.loading).toBe(false);
  });

  it('clears the spinner for a non-admin without fetching', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect(c.loading).toBe(false);
    expect(contactService.getContacts).not.toHaveBeenCalled();
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
});
