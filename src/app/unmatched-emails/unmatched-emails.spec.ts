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
    getRejected: jest.fn(),
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
    emailService.getRejected.mockReturnValue(of([]));
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

  it('finds a conversation by one of its participants', () => {
    emailService.getUnmatched.mockReturnValue(of([
      entry({ id: 'single' }),
      entry({
        id: 'thread',
        is_thread: true,
        message_count: 3,
        participants: [{ email: 'joe@example.com', name: 'Joe Parent' }],
      }),
    ]));
    const c = build();
    c.ngOnInit();
    c.applyFilter(' Joe Parent ');
    const source = (c as unknown as { dataSource: { filteredData: EmailEntry[] } }).dataSource;
    expect(source.filteredData.map(e => e.id)).toEqual(['thread']);
    c.applyFilter('joe@example.com');
    expect(source.filteredData.map(e => e.id)).toEqual(['thread']);
  });

  it('shows the conversation chip and participants in the table', () => {
    emailService.getUnmatched.mockReturnValue(of([
      entry({ id: 'single' }),
      entry({
        id: 'thread',
        is_thread: true,
        message_count: 3,
        participants: [{ email: 'joe@example.com', name: 'Joe Parent' }],
        body_text: 'first\n\nsecond',
      }),
    ]));
    const fixture = TestBed.configureTestingModule({
      imports: [UnmatchedEmails],
      providers: [
        { provide: EmailService, useValue: emailService },
        { provide: ContactService, useValue: contactService },
        { provide: MatDialog, useValue: dialog },
      ],
    }).createComponent(UnmatchedEmails);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const chips = Array.from(el.querySelectorAll('.thread-chip')).map(n => n.textContent?.trim());
    expect(chips).toEqual(['Conversation · 3 messages']);

    const open = (id: string) => {
      fixture.componentInstance.toggleExpanded({ id });
      fixture.componentInstance['cdr'].markForCheck();
      fixture.detectChanges();
    };
    open('thread');
    expect(el.querySelector('.email-participants')?.textContent)
      .toBe('Participants: Joe Parent <joe@example.com>');
    expect(el.querySelector('.email-text')?.classList.contains('email-text--thread')).toBe(true);

    open('single');
    expect(el.querySelector('.email-participants')).toBeNull();
    expect(el.querySelector('.email-text')?.classList.contains('email-text--thread')).toBe(false);
  });

  describe('rejected forwards', () => {
    const rejected = (over: Partial<EmailEntry> = {}): EmailEntry => entry({
      id: 'r-1',
      status: 'rejected',
      rejected_reason: 'unknown_sender',
      forwarded_by: 'someone@example.com',
      ...over,
    });
    const view = (c: UnmatchedEmails) => c as unknown as {
      view: string; unmatched: EmailEntry[]; rejected: EmailEntry[]; expandedId: string | null;
      dataSource: { paginator: { firstPage: jest.Mock } | null };
    };

    it('loads both lists and starts on the review queue', () => {
      emailService.getUnmatched.mockReturnValue(of([entry()]));
      emailService.getRejected.mockReturnValue(of([rejected(), rejected({ id: 'r-2' })]));
      const c = build();
      c.ngOnInit();
      expect(view(c).view).toBe('unmatched');
      expect(view(c).unmatched.map(e => e.id)).toEqual(['hash-1']);
      expect(view(c).rejected.map(e => e.id)).toEqual(['r-1', 'r-2']);
      expect(data(c).map(e => e.id)).toEqual(['hash-1']);
    });

    it('switches lists, closes the open row and goes back to the first page', () => {
      emailService.getUnmatched.mockReturnValue(of([entry()]));
      emailService.getRejected.mockReturnValue(of([rejected()]));
      const c = build();
      c.ngOnInit();
      c.toggleExpanded({ id: 'hash-1' });
      const firstPage = jest.fn();
      view(c).dataSource.paginator = { firstPage };
      c.setView('rejected');
      expect(data(c).map(e => e.id)).toEqual(['r-1']);
      expect(view(c).expandedId).toBeNull();
      expect(firstPage).toHaveBeenCalledTimes(1);
      c.setView('unmatched');
      expect(data(c).map(e => e.id)).toEqual(['hash-1']);
    });

    it('switches lists before a paginator exists', () => {
      const c = build();
      c.ngOnInit();
      view(c).dataSource.paginator = null;
      expect(() => c.setView('rejected')).not.toThrow();
    });

    it('stays on the rejected list after an assign reloads the page', () => {
      emailService.getRejected.mockReturnValue(of([rejected(), rejected({ id: 'r-2' })]));
      const c = build();
      c.ngOnInit();
      c.setView('rejected');
      afterClosed = true;
      emailService.getRejected.mockReturnValue(of([rejected({ id: 'r-2' })]));
      c.openAssignDialog(rejected(), { stopPropagation: jest.fn() } as unknown as Event);
      expect(view(c).view).toBe('rejected');
      expect(data(c).map(e => e.id)).toEqual(['r-2']);
    });

    it('shows an empty rejected list when it cannot be read, without losing the queue', () => {
      emailService.getUnmatched.mockReturnValue(of([entry()]));
      emailService.getRejected.mockReturnValue(throwError(() => new Error('boom')));
      const c = build();
      c.ngOnInit();
      expect(view(c).rejected).toEqual([]);
      expect(data(c)).toHaveLength(1);
    });

    it('shows the counts, the reason and who sent it', () => {
      emailService.getUnmatched.mockReturnValue(of([entry()]));
      emailService.getRejected.mockReturnValue(of([
        rejected(),
        rejected({ id: 'r-2', rejected_reason: 'spam', forwarded_by: undefined }),
      ]));
      const fixture = TestBed.configureTestingModule({
        imports: [UnmatchedEmails],
        providers: [
          { provide: EmailService, useValue: emailService },
          { provide: ContactService, useValue: contactService },
          { provide: MatDialog, useValue: dialog },
        ],
      }).createComponent(UnmatchedEmails);
      fixture.detectChanges();
      const el: HTMLElement = fixture.nativeElement;
      const toggles = Array.from(el.querySelectorAll('mat-button-toggle')).map(n => n.textContent?.trim());
      expect(toggles).toEqual(['Awaiting review (1)', 'Rejected (2)']);
      expect(el.querySelector('.rejected-chip')).toBeNull();

      const show = () => { fixture.componentInstance['cdr'].markForCheck(); fixture.detectChanges(); };
      fixture.componentInstance.setView('rejected');
      show();
      expect(Array.from(el.querySelectorAll('.rejected-chip')).map(n => n.textContent?.trim()))
        .toEqual(['Sender is not staff', 'Flagged as spam']);

      fixture.componentInstance.toggleExpanded({ id: 'r-1' });
      show();
      expect(el.querySelector('.rejected-note')?.textContent?.replace(/\s+/g, ' ').trim())
        .toBe('Sent to the Hub by someone@example.com. Sender is not staff. Assign it if it is genuine, or discard it.');
      fixture.componentInstance.toggleExpanded({ id: 'r-2' });
      show();
      expect(el.querySelector('.rejected-note')?.textContent).toContain('Sent to the Hub by an unknown address.');
    });

    it('says so when a list is empty', () => {
      const fixture = TestBed.configureTestingModule({
        imports: [UnmatchedEmails],
        providers: [
          { provide: EmailService, useValue: emailService },
          { provide: ContactService, useValue: contactService },
          { provide: MatDialog, useValue: dialog },
        ],
      }).createComponent(UnmatchedEmails);
      fixture.detectChanges();
      const note = () => (fixture.nativeElement as HTMLElement).querySelector('.empty-note')?.textContent?.trim();
      expect(note()).toBe('No emails waiting for review.');
      fixture.componentInstance.setView('rejected');
      fixture.componentInstance['cdr'].markForCheck();
      fixture.detectChanges();
      expect(note()).toBe('No rejected emails.');
    });
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
