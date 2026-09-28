import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Billing } from './billing';
import { AuthService } from '../services/auth.service';
import { BillingService } from '../services/billing.service';
import { NoteService } from '../services/note.service';
import { BillingRecord } from '../models/billing-record.model';
import { BillingEntry } from '../models/billing-entry.model';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { semiStatement, statement, statementDue, statementLine } from '../../testing/statement.fixture';

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    setFontSize: jest.fn(),
    setFont: jest.fn(),
    text: jest.fn(),
    setTextColor: jest.fn(),
    save: jest.fn(),
  })),
}));
jest.mock('jspdf-autotable', () => ({ __esModule: true, default: jest.fn() }));

const click = (): Event => ({ stopPropagation: jest.fn() }) as unknown as Event;

describe('Billing', () => {
  let isAdmin: boolean;
  const billingService = {
    getStatements: jest.fn(),
    upsertBillingRecord: jest.fn(),
    setAmountOverride: jest.fn(),
  };
  let dialogResult: unknown;
  const dialog = { open: jest.fn(() => ({ afterClosed: () => of(dialogResult) })) };
  const noteService = { createNote: jest.fn() };
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => ({ id: 'c-admin', first_name: 'Ann' }),
  };
  const router = { navigate: jest.fn() };

  const providers = [
    { provide: AuthService, useValue: authService },
    { provide: BillingService, useValue: billingService },
    { provide: NoteService, useValue: noteService },
    { provide: Router, useValue: router },
  ];

  const build = (): Billing => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Billing],
      providers: [...providers, { provide: MatDialog, useValue: dialog }],
    });
    const c = TestBed.createComponent(Billing).componentInstance;
    c.selectedDate = new Date(2026, 6, 10); // July 2026
    return c;
  };

  const loaded = (): { c: Billing; entry: BillingEntry } => {
    const c = build();
    c.ngOnInit();
    return { c, entry: (c as any).dataSource.data[0] as BillingEntry };
  };

  beforeEach(() => {
    sessionStorage.clear();
    isAdmin = true;
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    billingService.getStatements.mockReturnValue(of([statement()]));
    billingService.setAmountOverride.mockReturnValue(of({ id: 'c-1#2026-07-01' }));
    billingService.upsertBillingRecord.mockReturnValue(of({ id: 'x' }));
    noteService.createNote.mockReturnValue(of({ id: 'n-1' }));
    dialogResult = undefined;
  });

  describe('month selection', () => {
    it('restores the saved month and ignores corrupt saved dates', () => {
      sessionStorage.setItem('btc-billing-view',
        JSON.stringify({ extra: { selectedDate: new Date(2026, 2, 10).toISOString() } }));
      const c1 = build();
      c1.ngOnInit();
      expect((c1 as any).selectedDate.getMonth()).toBe(2); // March restored
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2026-03');

      sessionStorage.setItem('btc-billing-view', JSON.stringify({ extra: { selectedDate: 'not-a-date' } }));
      const c2 = build();
      c2.ngOnInit();
      expect((c2 as any).selectedDate.getMonth()).toBe(6); // untouched

      sessionStorage.setItem('btc-billing-view', JSON.stringify({ extra: { selectedDate: 5 } }));
      const c3 = build();
      c3.ngOnInit();
      expect((c3 as any).selectedDate.getMonth()).toBe(6);
    });

    it('requests the selected month from the service', () => {
      loaded();
      expect(billingService.getStatements).toHaveBeenCalledWith('2026-07');
      expect(billingService.getStatements).toHaveBeenCalledTimes(1);
    });

    it('pads single-digit months and keeps December in its own year', () => {
      const c = build();
      c.onDateChange(new Date(2026, 0, 20));
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2026-01');
      c.onDateChange(new Date(2026, 11, 31));
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2026-12');
    });

    it('the day never matters: any date selects the 1st of its month', () => {
      const c = build();
      c.onDateChange(new Date(2026, 7, 23));
      expect((c as any).selectedDate).toEqual(new Date(2026, 7, 1));
      expect((c as any).monthStart).toEqual(new Date(2026, 7, 1));
      expect(JSON.parse(sessionStorage.getItem('btc-billing-view')!).extra.selectedDate)
        .toBe(new Date(2026, 7, 1).toISOString());
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2026-08');
    });

    it('ignores a null date', () => {
      const { c } = loaded();
      const before = (c as any).selectedDate;
      c.onDateChange(null);
      expect((c as any).selectedDate).toBe(before);
      expect(billingService.getStatements).toHaveBeenCalledTimes(1);
    });

    it('choosing a month in the picker closes it and loads that month', () => {
      const c = build();
      const picker = { close: jest.fn() };
      c.onMonthSelected(new Date(2026, 9, 1), picker);
      expect(picker.close).toHaveBeenCalled();
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2026-10');
    });

    it('steps a month back and forward, across the year boundary', () => {
      const { c } = loaded();
      c.shiftMonth(-1);
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2026-06');
      c.shiftMonth(1);
      c.shiftMonth(1);
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2026-08');
      c.onDateChange(new Date(2026, 11, 1));
      c.shiftMonth(1);
      expect(billingService.getStatements).toHaveBeenLastCalledWith('2027-01');
    });
  });

  describe('loading', () => {
    it('shows one row per statement', () => {
      billingService.getStatements.mockReturnValue(of([
        statement(),
        semiStatement({ contact_id: 'c-2', contact_name: 'Sam Roe' }),
      ]));
      const { c, entry } = loaded();
      expect((c as any).dataSource.data).toHaveLength(2);
      expect(entry.name).toBe('Casey Lee');
      expect(entry.packages).toBe('Pat: Succeed');
      expect(entry.due_first).toBe(362);
      expect(entry.total).toBe(362);
      expect((c as any).loading).toBe(false);
      expect((c as any).hasError).toBe(false);
    });

    it('shows nothing for non-admins and asks the service for nothing', () => {
      isAdmin = false;
      const { c } = loaded();
      expect((c as any).dataSource.data).toEqual([]);
      expect((c as any).loading).toBe(false);
      expect(billingService.getStatements).not.toHaveBeenCalled();
    });

    it('shows an error loudly when the statements fail to load', () => {
      billingService.getStatements.mockReturnValue(throwError(() => new Error('boom')));
      const { c } = loaded();
      expect((c as any).hasError).toBe(true);
      expect((c as any).loading).toBe(false);
      expect((c as any).dataSource.data).toEqual([]);
    });

    it('clears the error on the next successful load', () => {
      billingService.getStatements.mockReturnValue(throwError(() => new Error('boom')));
      const { c } = loaded();
      billingService.getStatements.mockReturnValue(of([statement()]));
      c.shiftMonth(1);
      expect((c as any).hasError).toBe(false);
      expect((c as any).dataSource.data).toHaveLength(1);
    });

    it('tolerates an empty response body', () => {
      billingService.getStatements.mockReturnValue(of(null));
      const { c } = loaded();
      expect((c as any).dataSource.data).toEqual([]);
      expect((c as any).hasError).toBe(false);
    });
  });

  describe('closed months', () => {
    const FROZEN = '2026-08-01T10:00:00.000Z';

    it('an open month is not marked closed', () => {
      const { c } = loaded();
      expect((c as any).monthClosed).toBe(false);
      expect((c as any).closedOn).toBe('');
    });

    it('a frozen month is marked closed with its date', () => {
      billingService.getStatements.mockReturnValue(of([
        statement(),
        statement({ contact_id: 'c-2', contact_name: 'Sam Roe', frozen_at: FROZEN }),
      ]));
      const { c } = loaded();
      expect((c as any).monthClosed).toBe(true);
      expect((c as any).closedOn).toBe('Aug 1, 2026');
    });

    it('a closed month can still be marked paid and overridden', () => {
      billingService.getStatements.mockReturnValue(of([statement({ frozen_at: FROZEN })]));
      const { c, entry } = loaded();
      c.togglePaid(entry, 'first', true);
      expect(entry.paid_first).toBe(true);
      dialogResult = { amount_override: 300 };
      c.openOverrideDialog(entry, 'first', click());
      expect(entry.due_first).toBe(300);
    });

    it('the PDF header says when the month closed', () => {
      billingService.getStatements.mockReturnValue(of([statement({ frozen_at: FROZEN })]));
      const { c } = loaded();
      c.exportPDF();
      const doc = (jsPDF as unknown as jest.Mock).mock.results.at(-1)!.value;
      expect(doc.text).toHaveBeenCalledWith('Billing: July 2026 (closed Aug 1, 2026)', 14, 23);
    });
  });

  it('a row click navigates to the contact page; entries without an id are inert', () => {
    const c = build();
    c.openContact({ contact_id: 'c-1' } as never);
    expect(router.navigate).toHaveBeenCalledWith(['/contacts', 'c-1']);
    router.navigate.mockClear();
    c.openContact({} as never);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  describe('breakdown', () => {
    it('opens and closes a row without navigating', () => {
      const { c, entry } = loaded();
      expect((c as any).isExpanded(entry)).toBe(false);
      const event = click();
      c.toggleExpanded(entry, event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect((c as any).isExpanded(entry)).toBe(true);
      c.toggleExpanded(entry, click());
      expect((c as any).isExpanded(entry)).toBe(false);
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('keeps rows independent', () => {
      billingService.getStatements.mockReturnValue(of([
        statement(), statement({ contact_id: 'c-2', contact_name: 'Sam Roe' }),
      ]));
      const { c } = loaded();
      const [a, b] = (c as any).dataSource.data as BillingEntry[];
      c.toggleExpanded(a, click());
      expect((c as any).isExpanded(a)).toBe(true);
      expect((c as any).isExpanded(b)).toBe(false);
    });

    it('an entry without a contact id never expands', () => {
      const { c } = loaded();
      const event = click();
      c.toggleExpanded({} as BillingEntry, event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect((c as any).isExpanded({} as BillingEntry)).toBe(false);
    });

    it('collapses every row when the month changes', () => {
      const { c, entry } = loaded();
      c.toggleExpanded(entry, click());
      c.shiftMonth(1);
      expect((c as any).isExpanded((c as any).dataSource.data[0])).toBe(false);
    });

    it('describes lines for the template', () => {
      const c = build();
      const line = statementLine({ from: '2026-07-14', sessions_billed: 3, flags: ['prorated_start'] });
      expect((c as any).linePeriod(line)).toBe('From Jul 14');
      expect((c as any).lineSessions(line)).toBe('3 of 4');
      expect((c as any).lineLabels(line)).toEqual(['Prorated start']);
    });
  });

  describe('paid toggle', () => {
    it('persists the full record and updates the row', () => {
      const { c, entry } = loaded();
      c.togglePaid(entry, 'first', true);
      const record = billingService.upsertBillingRecord.mock.calls.at(-1)![0];
      expect(record.contact_id).toBe('c-1');
      expect(record.period_start).toBe('2026-07-01');
      expect(record.cycle).toBe(BillingCycle.MONTHLY);
      expect(record.amount).toBe(362);
      expect(record.paid).toBe(true);
      expect(typeof record.paid_date).toBe('string');
      expect('amount_override' in record).toBe(false);
      expect(entry.paid_first).toBe(true);
    });

    it('files a payment note on the family contact when marked paid', () => {
      const { c, entry } = loaded();
      c.togglePaid(entry, 'first', true);
      const note = noteService.createNote.mock.calls.at(-1)![0];
      expect(note.message).toBe('Payment received: $362.00 for Jul 1, 2026 (Pat: Succeed)');
      expect(note.recipient_id).toBe('c-1');
      expect(note.recipient).toBe('Casey Lee');
      expect(note.author).toBe('Ann');
      expect(note.author_id).toBe('c-admin');
      expect(note.type).toBe('');
      expect(typeof note.date_time).toBe('string');
    });

    it('omits the package list from the note when there is none', () => {
      const { c, entry } = loaded();
      entry.packages = '';
      c.togglePaid(entry, 'first', true);
      expect(noteService.createNote.mock.calls.at(-1)![0].message)
        .toBe('Payment received: $362.00 for Jul 1, 2026');
    });

    it('does not file a note when un-marking paid', () => {
      const { c, entry } = loaded();
      c.togglePaid(entry, 'first', false);
      expect(noteService.createNote).not.toHaveBeenCalled();
      expect(billingService.upsertBillingRecord).toHaveBeenCalledWith(
        expect.objectContaining({ paid: false, paid_date: undefined }),
      );
    });

    it('a note failure never blocks the paid toggle', () => {
      noteService.createNote.mockReturnValue(throwError(() => new Error('note boom')));
      const { c, entry } = loaded();
      c.togglePaid(entry, 'first', true);
      expect(entry.paid_first).toBe(true);
    });

    it('carries the loaded override so the full-record upsert never drops it', () => {
      billingService.getStatements.mockReturnValue(of([
        statement({ dues: [statementDue({ override: 150, amount: 150 })] }),
      ]));
      const { c, entry } = loaded();
      c.togglePaid(entry, 'first', true);
      const saved = billingService.upsertBillingRecord.mock.calls.at(-1)![0] as BillingRecord;
      expect(saved.amount).toBe(150);
      expect(saved.amount_override).toBe(150);
    });

    it('carries a $0 override too', () => {
      billingService.getStatements.mockReturnValue(of([
        semiStatement({ dues: [
          statementDue({ derived: 181, amount: 181 }),
          statementDue({ day: 15, period_start: '2026-07-15', derived: 181, override: 0, amount: 0 }),
        ] }),
      ]));
      const { c, entry } = loaded();
      c.togglePaid(entry, 'fifteenth', true);
      const saved = billingService.upsertBillingRecord.mock.calls.at(-1)![0] as BillingRecord;
      expect(saved.amount).toBe(0);
      expect(saved.amount_override).toBe(0);
    });

    it('toggles the 15th of a semi-monthly family', () => {
      billingService.getStatements.mockReturnValue(of([semiStatement()]));
      const { c, entry } = loaded();
      c.togglePaid(entry, 'fifteenth', true);
      expect(billingService.upsertBillingRecord).toHaveBeenCalledWith(
        expect.objectContaining({ period_start: '2026-07-15', cycle: 'semi_monthly', amount: 181, paid: true }),
      );
      expect(entry.paid_fifteenth).toBe(true);
      expect(entry.paid_first).toBe(false);
      expect(noteService.createNote.mock.calls.at(-1)![0].message)
        .toBe('Payment received: $181.00 for Jul 15, 2026 (Pat: Succeed)');
    });

    it('toggles the 15th of a monthly entry using a zero amount', () => {
      const { c, entry } = loaded();
      c.togglePaid(entry, 'fifteenth', true);
      expect(billingService.upsertBillingRecord).toHaveBeenCalledWith(
        expect.objectContaining({ period_start: '2026-07-15', amount: 0 }),
      );
    });

    it('keeps the row state when persisting fails', () => {
      billingService.upsertBillingRecord.mockReturnValue(throwError(() => new Error('x')));
      const { c, entry } = loaded();
      c.togglePaid(entry, 'first', true);
      expect(entry.paid_first).toBe(false);
      expect(noteService.createNote).not.toHaveBeenCalled();
    });
  });

  describe('amount overrides', () => {
    it('knows which halves are overridden', () => {
      billingService.getStatements.mockReturnValue(of([
        semiStatement({ dues: [
          statementDue({ derived: 181, override: 0, amount: 0 }),
          statementDue({ day: 15, period_start: '2026-07-15', derived: 181, amount: 181 }),
        ] }),
      ]));
      const { c, entry } = loaded();
      expect((c as any).isOverridden(entry, 'first')).toBe(true);
      expect((c as any).isOverridden(entry, 'fifteenth')).toBe(false);
      expect(c.overrideTooltip(entry, 'first')).toBe('Overridden — calculated amount $181.00');
    });

    it('opens the dialog with the derived/current amounts and never navigates', () => {
      billingService.getStatements.mockReturnValue(of([
        statement({ dues: [statementDue({ override: 150, amount: 150 })] }),
      ]));
      const { c, entry } = loaded();
      const event = click();
      c.openOverrideDialog(entry, 'first', event);
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(dialog.open).toHaveBeenCalledWith(expect.anything(), {
        data: { contactName: 'Casey Lee', periodLabel: 'Due 1st — July 2026', derived: 362, current: 150 },
        width: '420px',
      });
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('persists a dialog result and patches the row (custom amount, then clear)', () => {
      const { c, entry } = loaded();
      const rows = (c as any).dataSource.data;
      dialogResult = { amount_override: 200 };
      c.openOverrideDialog(entry, 'first', click());
      expect(billingService.setAmountOverride).toHaveBeenCalledWith({
        contact_id: 'c-1', period_start: '2026-07-01', cycle: BillingCycle.MONTHLY, amount_override: 200,
      });
      expect(entry.due_first).toBe(200);
      expect(entry.override_first).toBe(200);
      expect(entry.total).toBe(200);
      expect((c as any).grandTotal).toBe(200);
      // A fresh array so the OnPush table re-renders its footer.
      expect((c as any).dataSource.data).not.toBe(rows);
      expect((c as any).dataSource.data).toEqual(rows);

      dialogResult = { amount_override: null };
      c.openOverrideDialog(entry, 'first', click());
      expect(billingService.setAmountOverride).toHaveBeenLastCalledWith(expect.objectContaining({ amount_override: null }));
      expect(entry.due_first).toBe(362);
      expect(entry.override_first).toBeNull();
      expect(entry.total).toBe(362);
    });

    it('a cancelled dialog or a failed save changes nothing', () => {
      const { c, entry } = loaded();
      c.openOverrideDialog(entry, 'first', click());
      expect(billingService.setAmountOverride).not.toHaveBeenCalled();
      dialogResult = { amount_override: 0 };
      billingService.setAmountOverride.mockReturnValue(throwError(() => new Error('x')));
      c.openOverrideDialog(entry, 'first', click());
      expect(entry.due_first).toBe(362);
      expect(entry.override_first).toBeNull();
    });

    it('handles the 15th half and clearing back to a blank derived half', () => {
      billingService.getStatements.mockReturnValue(of([semiStatement()]));
      const { c, entry } = loaded();
      dialogResult = { amount_override: 0 };
      c.openOverrideDialog(entry, 'fifteenth', click());
      expect(dialog.open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        data: { contactName: 'Casey Lee', periodLabel: 'Due 15th — July 2026', derived: 181, current: null },
      }));
      expect(billingService.setAmountOverride).toHaveBeenCalledWith({
        contact_id: 'c-1', period_start: '2026-07-15', cycle: BillingCycle.SEMI_MONTHLY, amount_override: 0,
      });
      expect(entry.due_fifteenth).toBe(0);
      expect(entry.override_fifteenth).toBe(0);
      expect(entry.due_first).toBe(181);
      expect(entry.total).toBe(181);

      entry.derived_fifteenth = null;
      dialogResult = { amount_override: null };
      c.openOverrideDialog(entry, 'fifteenth', click());
      expect(entry.due_fifteenth).toBeNull();
      expect(entry.total).toBe(181);
    });

    it('tolerates sparse entries', () => {
      const { c } = loaded();
      c.openOverrideDialog({ name: 'X' } as BillingEntry, 'first', click());
      expect(dialog.open).not.toHaveBeenCalled();

      const sparse = { contact_id: 'c-9', derived_first: null, override_first: null } as BillingEntry;
      expect(c.overrideTooltip(sparse, 'first')).toBe('Overridden — calculated amount —');
      expect(c.overrideTooltip({} as BillingEntry, 'fifteenth')).toBe('Overridden — calculated amount —');
      dialogResult = { amount_override: 25 };
      c.openOverrideDialog(sparse, 'first', click());
      expect(dialog.open).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
        data: expect.objectContaining({ contactName: '', derived: null, current: null }),
      }));
      expect(billingService.setAmountOverride).toHaveBeenCalledWith(expect.objectContaining({
        contact_id: 'c-9', cycle: BillingCycle.MONTHLY, amount_override: 25,
      }));
      expect(sparse.due_first).toBe(25);
      expect(sparse.total).toBe(25);
      dialogResult = { amount_override: null };
      c.openOverrideDialog(sparse, 'first', click());
      expect(sparse.due_first).toBeNull();
      expect(sparse.total).toBe(0);
    });
  });

  it('isSemiMonthly reflects the entry cycle', () => {
    const c = build();
    expect((c as any).isSemiMonthly({ cycle: BillingCycle.SEMI_MONTHLY })).toBe(true);
    expect((c as any).isSemiMonthly({ cycle: BillingCycle.MONTHLY })).toBe(false);
  });

  it('wires the sort and paginator setters and ignores falsy values', () => {
    const c = build();
    const sort = {} as any;
    const paginator = {} as any;
    (c as any).matSort = sort;
    (c as any).matPaginator = paginator;
    expect((c as any).dataSource.sort).toBe(sort);
    expect((c as any).dataSource.paginator).toBe(paginator);
    (c as any).matSort = undefined;
    (c as any).matPaginator = undefined;
    expect((c as any).dataSource.sort).toBe(sort);
    expect((c as any).dataSource.paginator).toBe(paginator);
  });

  describe('PDF export', () => {
    const lastTable = () => (autoTable as unknown as jest.Mock).mock.calls.at(-1)![1];
    const lastDoc = () => (jsPDF as unknown as jest.Mock).mock.results.at(-1)!.value;

    it('covers monthly and semi-monthly rows', () => {
      const { c } = loaded();
      (c as any).dataSource.data = [
        {
          name: 'Casey Lee', packages: 'Pat: Succeed', cycle: BillingCycle.MONTHLY,
          due_first: 362, due_fifteenth: null, total: 362,
        } as BillingEntry,
        {
          name: 'Sam Roe', packages: 'Kai: Thrive; Rio: Thrive', cycle: BillingCycle.SEMI_MONTHLY,
          due_first: 163, due_fifteenth: 163, total: 326, discount: 36, discount_percent: 10,
        } as BillingEntry,
        { name: 'Both', total: 10, discount: 5, discount_percent: 0 } as BillingEntry,
        {} as BillingEntry,
      ];
      c.exportPDF();

      const doc = lastDoc();
      expect(doc.setFontSize).toHaveBeenNthCalledWith(1, 16);
      expect(doc.setFontSize).toHaveBeenNthCalledWith(2, 10);
      expect(doc.setFont).toHaveBeenNthCalledWith(1, 'helvetica', 'bold');
      expect(doc.setFont).toHaveBeenNthCalledWith(2, 'helvetica', 'normal');
      expect(doc.setTextColor).toHaveBeenNthCalledWith(1, 100);
      expect(doc.setTextColor).toHaveBeenNthCalledWith(2, 0);
      expect(doc.text).toHaveBeenCalledWith('Beyond the Chalkboard Tutoring', 14, 16);
      expect(doc.text).toHaveBeenCalledWith('Billing: July 2026', 14, 23);
      expect(doc.save).toHaveBeenCalledWith('billing-July-2026.pdf');

      const config = lastTable();
      expect(config.startY).toBe(28);
      expect(config.styles).toEqual({ fontSize: 9 });
      expect(config.headStyles).toEqual({ fillColor: [17, 138, 178] });
      expect(config.head).toEqual([['Contact', 'Students', 'Cycle', 'Due 1st', 'Due 15th', 'Discount', 'Total']]);
      expect(config.body).toEqual([
        ['Casey Lee', 'Pat: Succeed', 'Monthly', '$362.00', '—', '—', '$362.00'],
        ['Sam Roe', 'Kai: Thrive; Rio: Thrive', 'Semi-monthly', '$163.00', '$163.00', '-$36.00 (10%)', '$326.00'],
        ['Both', '', 'Monthly', '—', '—', '-$5.00', '$10.00'],
        ['', '', 'Monthly', '—', '—', '—', '$0.00'],
      ]);
      expect(config.foot).toEqual([
        ['Grand Total', '', '', '$525.00', '$163.00', '', '$698.00'],
      ]);
      expect(config.showFoot).toBe('lastPage');
      expect(config.footStyles).toEqual({ fillColor: [17, 138, 178] });
    });

    it('an ordinary full month has no breakdown rows', () => {
      const { c } = loaded();
      c.exportPDF();
      expect(lastTable().body).toEqual([
        ['Casey Lee', 'Pat: Succeed', 'Monthly', '$362.00', '—', '—', '$362.00'],
      ]);
      expect(lastDoc().text).not.toHaveBeenCalledWith('* manually overridden amount', 120, 23);
    });

    it('an unusual month lists its lines, discount and group fee', () => {
      billingService.getStatements.mockReturnValue(of([
        statement({
          lines: [
            statementLine({
              from: '2026-07-14', sessions_billed: 3, amount: 250.62, net: 225.56,
              discount_percent: 10, discount_amount: 25.06, flags: ['prorated_start', 'discount'],
            }),
            statementLine({ student_name: 'Sam', package: 'Start' }),
          ],
          flags: ['prorated_start', 'discount'],
          sibling_discount_percent: 5,
          sibling_discount_amount: 29.38,
          group_fee: 75,
          group_students: ['Sam'],
          dues: [statementDue({ derived: 633.18, amount: 633.18 })],
        }),
      ]));
      const { c } = loaded();
      c.exportPDF();
      const styles = { fontSize: 8, textColor: 90, fontStyle: 'italic' };
      expect(lastTable().body).toEqual([
        ['Casey Lee', 'Pat: Succeed; Sam: Start; Sam: BTC & Me', 'Monthly', '$633.18', '—', '-$54.44', '$633.18'],
        [
          { content: '    Pat: Succeed, from Jul 14, 3 of 4 sessions at $83.54, less 10% ($25.06) [Prorated start, Discount]', colSpan: 6, styles },
          { content: '$225.56', styles },
        ],
        [
          { content: '    Sam: Start, full month', colSpan: 6, styles },
          { content: '$362.00', styles },
        ],
        [
          { content: '    Sibling discount 5%', colSpan: 6, styles },
          { content: '-$29.38', styles },
        ],
        [
          { content: '    BTC & Me fee (Sam)', colSpan: 6, styles },
          { content: '$75.00', styles },
        ],
      ]);
    });

    it('a flagged month without extras lists only its lines', () => {
      billingService.getStatements.mockReturnValue(of([
        statement({
          lines: [statementLine({ to: '2026-07-18', sessions_billed: 2, amount: 167.08, net: 167.08, flags: ['prorated_end'] })],
          flags: ['prorated_end'],
        }),
      ]));
      const { c } = loaded();
      c.exportPDF();
      expect(lastTable().body).toHaveLength(2);
      expect(lastTable().body[1][0].content)
        .toBe('    Pat: Succeed, through Jul 18, 2 of 4 sessions at $83.54 [Prorated end]');
    });

    it('a labelled row without a statement has no breakdown rows', () => {
      const { c } = loaded();
      (c as any).dataSource.data = [{ name: 'X', labels: ['Discount'], total: 1 } as BillingEntry];
      c.exportPDF();
      expect(lastTable().body).toHaveLength(1);
    });

    it('marks overridden dues, "No charge" for zero, and adds a footnote', () => {
      billingService.getStatements.mockReturnValue(of([
        semiStatement({ dues: [
          statementDue({ derived: 181, override: 150, amount: 150 }),
          statementDue({ day: 15, period_start: '2026-07-15', derived: 181, override: 0, amount: 0 }),
        ] }),
      ]));
      const { c } = loaded();
      c.exportPDF();
      expect(lastTable().body[0][3]).toBe('$150.00*');
      expect(lastTable().body[0][4]).toBe('No charge');
      expect(lastDoc().text).toHaveBeenCalledWith('* manually overridden amount', 120, 23);
    });

    it('adds the footnote when only the 15th is overridden', () => {
      billingService.getStatements.mockReturnValue(of([
        semiStatement({ dues: [
          statementDue({ derived: 181, amount: 181 }),
          statementDue({ day: 15, period_start: '2026-07-15', derived: 181, override: 5, amount: 5 }),
        ] }),
      ]));
      const { c } = loaded();
      c.exportPDF();
      expect(lastTable().body[0][3]).toBe('$181.00');
      expect(lastTable().body[0][4]).toBe('$5.00*');
      expect(lastDoc().text).toHaveBeenCalledWith('* manually overridden amount', 120, 23);
    });
  });

  describe('grand total', () => {
    it('sums the Total column across all rows, re-rounded', () => {
      const c = build();
      (c as any).dataSource.data = [
        { total: 0.1 } as BillingEntry,
        { total: 0.2 } as BillingEntry,
        {} as BillingEntry,
      ];
      expect((c as any).grandTotal).toBe(0.3);
    });

    it('is zero with no rows', () => {
      const c = build();
      expect((c as any).grandTotal).toBe(0);
      expect((c as any).grandDueFirst).toBe(0);
      expect((c as any).grandDueFifteenth).toBe(0);
    });

    it('sums the due columns null-safely, re-rounded', () => {
      const c = build();
      (c as any).dataSource.data = [
        { due_first: 0.1, due_fifteenth: 0.2 } as BillingEntry,
        { due_first: 0.2, due_fifteenth: null } as BillingEntry,
        {} as BillingEntry,
      ];
      expect((c as any).grandDueFirst).toBe(0.3);
      expect((c as any).grandDueFifteenth).toBe(0.2);
    });
  });

  // Rendered against the template so a template error (a missing cell def, a
  // bad binding in the breakdown row) cannot slip through.
  describe('template', () => {
    const render = () => {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        imports: [Billing],
        providers: [provideNoopAnimations(), ...providers],
      });
      const fixture = TestBed.createComponent(Billing);
      fixture.componentInstance.selectedDate = new Date(2026, 6, 10);
      fixture.detectChanges();
      return fixture;
    };
    const text = (fixture: ReturnType<typeof render>): string =>
      (fixture.nativeElement as HTMLElement).textContent ?? '';

    it('renders the month, the rows and the footer', () => {
      const fixture = render();
      expect(text(fixture)).toContain('July 2026');
      expect(text(fixture)).toContain('Casey Lee');
      expect(text(fixture)).toContain('Grand Total');
      expect(text(fixture)).toContain('$362.00');
      expect(text(fixture)).not.toContain('Calculated total');
    });

    it('renders labels and the breakdown once a row is opened', () => {
      billingService.getStatements.mockReturnValue(of([
        statement({
          lines: [
            statementLine({
              from: '2026-07-14', sessions_billed: 3, amount: 250.62, net: 225.56,
              discount_percent: 10, discount_amount: 25.06, flags: ['prorated_start', 'discount'],
            }),
            statementLine({ kind: 'prior_package', package: 'Previous package', to: '2026-07-13', rate: 0, amount: 63, net: 63 }),
          ],
          flags: ['prorated_start', 'discount'],
          package_subtotal: 288.56,
          sibling_discount_percent: 5,
          sibling_discount_amount: 14.43,
          group_fee: 75,
          group_students: ['Pat'],
          total: 349.13,
          needs_attention: true,
          dues: [statementDue({ derived: 349.13, amount: 349.13 })],
        }),
      ]));
      const fixture = render();
      expect(text(fixture)).toContain('Prorated start');
      expect(fixture.nativeElement.querySelector('.attention-icon')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.billing-detail')).toBeNull();

      (fixture.nativeElement.querySelector('.expand-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      const detail = fixture.nativeElement.querySelector('.billing-detail') as HTMLElement;
      expect(detail).not.toBeNull();
      expect(detail.textContent).toContain('From Jul 14');
      expect(detail.textContent).toContain('3 of 4');
      expect(detail.textContent).toContain('-$25.06');
      expect(detail.textContent).toContain('Previous package');
      expect(detail.textContent).toContain('Sibling discount (5%)');
      expect(detail.textContent).toContain('BTC & Me (Pat)');
      expect(detail.textContent).toContain('$349.13');
      expect(fixture.nativeElement.querySelector('.billing-detail-open')).not.toBeNull();
      expect(router.navigate).not.toHaveBeenCalled();
    });

    it('renders a group-only family without a line table', () => {
      billingService.getStatements.mockReturnValue(of([
        statement({
          lines: [], package_subtotal: 0, group_fee: 75, group_students: ['Pat'], total: 75,
          dues: [statementDue({ derived: 75, amount: 75 })],
        }),
      ]));
      const fixture = render();
      (fixture.nativeElement.querySelector('.expand-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.detail-table')).toBeNull();
      expect(fixture.nativeElement.querySelector('.detail-summary')).not.toBeNull();
    });

    it('renders the closed label and the legacy note', () => {
      billingService.getStatements.mockReturnValue(of([
        statement({ lines: [], legacy: true, frozen_at: '2026-08-01T10:00:00.000Z' }),
      ]));
      const fixture = render();
      expect(text(fixture)).toContain('Closed Aug 1, 2026');
      expect(fixture.nativeElement.querySelector('.legacy-note')).toBeNull();
      (fixture.nativeElement.querySelector('.expand-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.legacy-note')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.detail-table')).toBeNull();
    });

    it('an open month shows neither', () => {
      const fixture = render();
      expect(text(fixture)).not.toContain('Closed');
      (fixture.nativeElement.querySelector('.expand-button') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.legacy-note')).toBeNull();
    });

    it('renders the error, empty and non-admin states', () => {
      billingService.getStatements.mockReturnValue(throwError(() => new Error('boom')));
      expect(text(render())).toContain("Billing couldn't be calculated for this month.");
      billingService.getStatements.mockReturnValue(of([]));
      expect(text(render())).toContain('No billable contacts for this month.');
      isAdmin = false;
      expect(text(render())).toContain('Billing is available to administrators only.');
    });
  });
});
