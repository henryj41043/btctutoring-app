import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { UnmatchedEmails } from './unmatched-emails';
import { EmailService } from '../services/email.service';
import { ContactService } from '../services/contact.service';
import { AssignEmailDialog } from '../assign-email-dialog/assign-email-dialog';
import { EmailEntry } from '../models/email-entry.model';
import { Contact } from '../models/contact.model';

const entry = (over: Partial<EmailEntry> = {}): EmailEntry => ({
  id: 'hash-1',
  status: 'unmatched',
  subject: 'Question about billing',
  from_email: 'jane@example.com',
  from_name: 'Jane Parent',
  received_at: '2026-08-10T12:00:00Z',
  body_text: 'Was I double charged?',
  ...over,
});

describe('UnmatchedEmails', () => {
  let afterClosed: unknown;
  const emailService = {
    getUnmatched: jest.fn(),
    getOriginalUrl: jest.fn(),
  };
  const contactService = { getContactsSummary: jest.fn() };
  const dialog = { open: jest.fn(() => ({ afterClosed: () => of(afterClosed) })) };

  const build = (): UnmatchedEmails => {
    TestBed.configureTestingModule({
      imports: [UnmatchedEmails],
      providers: [
        { provide: EmailService, useValue: emailService },
        { provide: ContactService, useValue: contactService },
        { provide: MatDialog, useValue: dialog },
      ],
    });
    return TestBed.createComponent(UnmatchedEmails).componentInstance;
  };

  const data = (c: UnmatchedEmails): EmailEntry[] =>
    (c as unknown as { dataSource: { data: EmailEntry[] } }).dataSource.data;

  beforeEach(() => {
    sessionStorage.clear();
    afterClosed = false;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    emailService.getUnmatched.mockReturnValue(of([]));
    emailService.getOriginalUrl.mockReturnValue(of({ url: 'https://signed' }));
    contactService.getContactsSummary.mockReturnValue(of([]));
  });

  it('loads the queue and the contact summaries on init', () => {
    emailService.getUnmatched.mockReturnValue(of([entry()]));
    contactService.getContactsSummary.mockReturnValue(of([{ id: 'c-1' } as Contact]));
    const c = build();
    c.ngOnInit();
    expect(data(c)).toEqual([entry()]);
    expect((c as unknown as { contacts: Contact[] }).contacts).toEqual([{ id: 'c-1' }]);
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('degrades to an empty queue when either fetch fails', () => {
    emailService.getUnmatched.mockReturnValue(throwError(() => new Error('x')));
    contactService.getContactsSummary.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    expect(data(c)).toEqual([]);
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('shows the parsed sender, or who forwarded an unknown one', () => {
    const c = build();
    expect(c.fromDisplay(entry())).toBe('Jane Parent <jane@example.com>');
    expect(c.fromDisplay(entry({ from_name: undefined }))).toBe('jane@example.com');
    expect(c.fromDisplay(entry({ from_email: undefined, from_name: undefined, forwarded_by: 'admin@x.com' })))
      .toBe('unknown — forwarded by admin@x.com');
    expect(c.fromDisplay(entry({ from_email: undefined, from_name: undefined }))).toBe('unknown');
  });

  it('filters across sender, subject and body; persists the filter', () => {
    emailService.getUnmatched.mockReturnValue(of([
      entry(),
      entry({ id: 'hash-2', subject: 'Trial request', from_email: 'sam@example.org', from_name: undefined, body_text: 'zzz' }),
    ]));
    const c = build();
    c.ngOnInit();
    const ds = (c as unknown as { dataSource: { filteredData: EmailEntry[] } }).dataSource;
    c.applyFilter('  JANE ');
    expect(ds.filteredData.map(e => e.id)).toEqual(['hash-1']);
    c.applyFilter('trial');
    expect(ds.filteredData.map(e => e.id)).toEqual(['hash-2']);
    expect(JSON.parse(sessionStorage.getItem('btc-unmatched-emails-view')!).filter).toBe('trial');
    expect((c as unknown as { searchText: string }).searchText).toBe('trial');
  });

  it('expands and collapses a row; an id-less row collapses to null', () => {
    const c = build();
    const row = entry();
    c.toggleExpanded(row);
    expect(c.isExpanded(row)).toBe(true);
    c.toggleExpanded(row);
    expect(c.isExpanded(row)).toBe(false);
    c.toggleExpanded(entry({ id: undefined }));
    expect((c as unknown as { expandedId: string | null }).expandedId).toBeNull();
  });

  it('restores the saved search filter for the session', () => {
    sessionStorage.setItem('btc-unmatched-emails-view', JSON.stringify({ filter: 'jane' }));
    const c = build();
    c.ngOnInit();
    expect((c as unknown as { dataSource: { filter: string } }).dataSource.filter).toBe('jane');
  });

  it('wires the paginator through the view-child setter and ignores null', () => {
    const c = build();
    c.matPaginator = null as never;
    const ds = (c as unknown as { dataSource: { paginator: unknown } }).dataSource;
    expect(ds.paginator).toBeFalsy();
    const paginator = {} as never;
    c.matPaginator = paginator;
    expect(ds.paginator).toBe(paginator);
  });

  it('assign dialog resolution reloads the queue', () => {
    afterClosed = true;
    const c = build();
    c.ngOnInit();
    emailService.getUnmatched.mockClear();
    const event = { stopPropagation: jest.fn() } as unknown as Event;
    c.openAssignDialog(entry(), event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(dialog.open).toHaveBeenCalledWith(AssignEmailDialog, expect.objectContaining({
      data: expect.objectContaining({ mode: 'assign' }),
    }));
    expect(emailService.getUnmatched).toHaveBeenCalled();
  });

  it('a cancelled discard dialog does not reload', () => {
    afterClosed = false;
    const c = build();
    c.ngOnInit();
    emailService.getUnmatched.mockClear();
    c.openDiscardDialog(entry(), { stopPropagation: jest.fn() } as unknown as Event);
    expect(dialog.open).toHaveBeenCalledWith(AssignEmailDialog, expect.objectContaining({
      data: expect.objectContaining({ mode: 'discard' }),
    }));
    expect(emailService.getUnmatched).not.toHaveBeenCalled();
  });

  it('view original opens the presigned url in a new tab', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const c = build();
    c.viewOriginal(entry(), { stopPropagation: jest.fn() } as unknown as Event);
    expect(emailService.getOriginalUrl).toHaveBeenCalledWith('hash-1');
    expect(open).toHaveBeenCalledWith('https://signed', '_blank');
    open.mockRestore();
  });

  it('view original is a no-op without an id and swallows fetch errors', () => {
    const open = jest.spyOn(window, 'open').mockImplementation(() => null);
    const c = build();
    c.viewOriginal(entry({ id: undefined }), { stopPropagation: jest.fn() } as unknown as Event);
    expect(emailService.getOriginalUrl).not.toHaveBeenCalled();
    emailService.getOriginalUrl.mockReturnValue(throwError(() => new Error('x')));
    expect(() =>
      c.viewOriginal(entry(), { stopPropagation: jest.fn() } as unknown as Event),
    ).not.toThrow();
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
