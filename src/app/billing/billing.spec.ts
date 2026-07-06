import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Billing } from './billing';
import { AuthService } from '../services/auth.service';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { BillingService } from '../services/billing.service';
import { Contact } from '../models/contact.model';
import { Student } from '../models/student.model';
import { BillingRecord } from '../models/billing-record.model';
import { BillingEntry } from '../models/billing-entry.model';
import { Status } from '../enums/status.enum';
import { Package } from '../enums/package.enum';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { Weekday } from '../enums/weekday.enum';
import { studentMonthlyCharge } from '../utils/billing-amount';

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

const contact = (over: Partial<Contact> = {}): Contact =>
  ({ id: 'c-1', first_name: 'Casey', last_name: 'Lee', billing_cycle: BillingCycle.MONTHLY, ...over }) as Contact;

const student = (over: Partial<Student> = {}): Student =>
  ({
    id: 's-1',
    contact_id: 'c-1',
    name: 'Pat',
    status: Status.ACTIVE_STUDENT,
    package: Package.SUCCEED, // $362/mo
    package_start_date: '2026-05-01T00:00:00', // before the billing month → full month
    schedule: [{ weekday: Weekday.MONDAY, start_time: '10:00', end_time: '10:30' }],
    ...over,
  }) as Student;

describe('Billing', () => {
  let isAdmin: boolean;
  const contactService = { getContacts: jest.fn() };
  const studentService = { getStudents: jest.fn() };
  const billingService = { getBillingRecords: jest.fn(), upsertBillingRecord: jest.fn() };
  const authService = { isAdmin: () => isAdmin };

  const build = (): Billing => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [Billing],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ContactService, useValue: contactService },
        { provide: StudentService, useValue: studentService },
        { provide: BillingService, useValue: billingService },
      ],
    });
    const c = TestBed.createComponent(Billing).componentInstance;
    c.selectedDate = new Date(2026, 6, 10); // July 2026
    return c;
  };

  beforeEach(() => {
    isAdmin = true;
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    contactService.getContacts.mockReturnValue(of([contact()]));
    studentService.getStudents.mockReturnValue(of([student()]));
    billingService.getBillingRecords.mockReturnValue(of([]));
  });

  it('builds a monthly billing entry with the full package cost', () => {
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data).toHaveLength(1);
    const entry = (c as any).dataSource.data[0];
    expect(entry.total).toBe(362);
    expect(entry.due_first).toBe(362);
    expect(entry.due_fifteenth).toBeNull();
    expect(entry.cycle).toBe(BillingCycle.MONTHLY);
  });

  it('splits a semi-monthly contact across the 1st and 15th', () => {
    contactService.getContacts.mockReturnValue(of([contact({ billing_cycle: BillingCycle.SEMI_MONTHLY })]));
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    expect(entry.due_first).toBe(181);
    expect(entry.due_fifteenth).toBe(181);
    expect(entry.due_first + entry.due_fifteenth).toBe(entry.total);
  });

  it('splits a semi-monthly prorated first month evenly across the 1st and 15th (start before the 15th)', () => {
    // Default Monday schedule; July 2026 Mondays: 6, 13, 20, 27. Start Jul 10 →
    // 3 remaining slots → 3 × $41.77 = $125.31, split evenly across both dates.
    const s = student({ package_start_date: '2026-07-10T00:00:00' });
    contactService.getContacts.mockReturnValue(of([contact({ billing_cycle: BillingCycle.SEMI_MONTHLY })]));
    studentService.getStudents.mockReturnValue(of([s]));
    const c = build(); // viewing July 2026
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    expect(studentMonthlyCharge(s, 2026, 6)).toBe(125.31);
    expect(entry.due_first).toBe(62.66);
    expect(entry.due_fifteenth).toBe(62.65);
    expect(entry.total).toBe(125.31);
  });

  it('bills a semi-monthly prorated first month entirely on the 15th of the start month (start on/after the 15th)', () => {
    // Start Jul 20 → 2 remaining Mondays → $83.54, all on July's 15th; 1st blank.
    const s = student({ package_start_date: '2026-07-20T00:00:00' });
    contactService.getContacts.mockReturnValue(of([contact({ billing_cycle: BillingCycle.SEMI_MONTHLY })]));
    studentService.getStudents.mockReturnValue(of([s]));
    const july = build(); // viewing July 2026 — the START month shows the charge
    july.ngOnInit();
    const entry = (july as any).dataSource.data[0];
    expect(entry.due_first).toBeNull(); // 1st left blank
    expect(entry.due_fifteenth).toBe(83.54);
    expect(entry.total).toBe(83.54);
  });

  it('shows a prorated monthly first month on the 1st of the start month', () => {
    // Monthly cycle, start Jul 20 → bill date is July 1st with the prorated amount.
    const s = student({ package_start_date: '2026-07-20T00:00:00' });
    studentService.getStudents.mockReturnValue(of([s]));
    const c = build(); // monthly contact fixture, viewing July 2026
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    expect(entry.due_first).toBe(83.54);
    expect(entry.due_fifteenth).toBeNull();
    expect(entry.total).toBe(83.54);
  });

  it('resumes the normal 50/50 split the month after a prorated first month', () => {
    const s = student({ package_start_date: '2026-07-10T00:00:00' });
    contactService.getContacts.mockReturnValue(of([contact({ billing_cycle: BillingCycle.SEMI_MONTHLY })]));
    studentService.getStudents.mockReturnValue(of([s]));
    const c = build();
    c.selectedDate = new Date(2026, 7, 1); // August
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    expect(entry.due_first).toBe(181);
    expect(entry.due_fifteenth).toBe(181);
  });

  it('treats a legacy biweekly cycle as semi-monthly', () => {
    contactService.getContacts.mockReturnValue(of([contact({ billing_cycle: 'biweekly' as any })]));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data[0].cycle).toBe(BillingCycle.SEMI_MONTHLY);
  });

  it('reflects an existing paid record', () => {
    billingService.getBillingRecords.mockReturnValue(
      of([{ contact_id: 'c-1', period_start: '2026-07-01', paid: true } as BillingRecord]),
    );
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data[0].paid_first).toBe(true);
  });

  it('flags a contact whose student is missing a schedule', () => {
    studentService.getStudents.mockReturnValue(of([student({ schedule: undefined })]));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data[0].needs_attention).toBe(true);
  });

  it('excludes inactive students and contacts with no billable students', () => {
    studentService.getStudents.mockReturnValue(of([student({ status: Status.PAST_STUDENT })]));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data).toHaveLength(0);
  });

  it('shows nothing for non-admins', () => {
    isAdmin = false;
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data).toHaveLength(0);
  });

  it('persists a paid toggle with the full record and updates the row', () => {
    billingService.upsertBillingRecord.mockReturnValue(of({ id: 'c-1#2026-07-01' }));
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    c.togglePaid(entry, 'first', true);
    const record = billingService.upsertBillingRecord.mock.calls.at(-1)![0];
    expect(record.contact_id).toBe('c-1');
    expect(record.period_start).toBe('2026-07-01');
    expect(record.cycle).toBe(BillingCycle.MONTHLY);
    expect(record.amount).toBe(362);
    expect(record.paid).toBe(true);
    expect(typeof record.paid_date).toBe('string');
    expect(entry.paid_first).toBe(true);
  });

  it('derives an entry with exact name, packages, amount and paid status', () => {
    billingService.getBillingRecords.mockReturnValue(
      of([{ contact_id: 'c-1', period_start: '2026-07-01', paid: true } as BillingRecord]),
    );
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    expect(entry.name).toBe('Casey Lee');
    expect(entry.packages).toBe('Pat: Succeed');
    expect(entry.total).toBe(362);
    expect(entry.due_first).toBe(362);
    expect(entry.paid_first).toBe(true);
  });

  it('survives load errors from any source by showing an empty table', () => {
    contactService.getContacts.mockReturnValue(throwError(() => new Error('x')));
    studentService.getStudents.mockReturnValue(throwError(() => new Error('x')));
    billingService.getBillingRecords.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data).toHaveLength(0);
  });

  it('isSemiMonthly reflects the entry cycle', () => {
    const c = build();
    expect((c as any).isSemiMonthly({ cycle: BillingCycle.SEMI_MONTHLY })).toBe(true);
    expect((c as any).isSemiMonthly({ cycle: BillingCycle.MONTHLY })).toBe(false);
  });

  it('treats an unknown/undefined billing cycle as monthly', () => {
    contactService.getContacts.mockReturnValue(of([contact({ billing_cycle: undefined })]));
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    expect(entry.cycle).toBe(BillingCycle.MONTHLY);
    expect(entry.due_fifteenth).toBeNull();
  });

  it('toggles the 15th payment for a semi-monthly contact and clears paid_date when unchecked', () => {
    contactService.getContacts.mockReturnValue(of([contact({ billing_cycle: BillingCycle.SEMI_MONTHLY })]));
    billingService.upsertBillingRecord.mockReturnValue(of({ id: 'x' }));
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    c.togglePaid(entry, 'fifteenth', false);
    expect(billingService.upsertBillingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ period_start: '2026-07-15', paid: false, paid_date: undefined }),
    );
    expect(entry.paid_fifteenth).toBe(false);
  });

  it('toggles the 15th of a monthly entry using a zero amount', () => {
    billingService.upsertBillingRecord.mockReturnValue(of({ id: 'x' }));
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0]; // monthly → due_fifteenth null
    c.togglePaid(entry, 'fifteenth', true);
    expect(billingService.upsertBillingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ period_start: '2026-07-15', amount: 0 }),
    );
  });

  it('keeps the row state when persisting a paid toggle fails', () => {
    billingService.upsertBillingRecord.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    c.togglePaid(entry, 'first', true);
    expect(entry.paid_first).toBe(false);
  });

  it('onDateChange reloads for a new month and ignores null', () => {
    const c = build();
    c.ngOnInit();
    c.onDateChange(new Date(2026, 7, 5));
    expect((c as any).monthStart.getMonth()).toBe(7);
    const before = (c as any).selectedDate;
    c.onDateChange(null);
    expect((c as any).selectedDate).toBe(before);
  });

  it('wires the sort and paginator setters and ignores falsy values', () => {
    const c = build();
    const sort = {} as any;
    const paginator = {} as any;
    (c as any).matSort = sort;
    (c as any).matPaginator = paginator;
    expect((c as any).dataSource.sort).toBe(sort);
    expect((c as any).dataSource.paginator).toBe(paginator);
    // Falsy values are ignored (the @if guard in each setter).
    (c as any).matSort = undefined;
    (c as any).matPaginator = undefined;
    expect((c as any).dataSource.sort).toBe(sort);
  });

  it('skips orphan students and contacts billed at zero', () => {
    contactService.getContacts.mockReturnValue(of([contact({ id: 'c-2', first_name: 'Sam' })]));
    studentService.getStudents.mockReturnValue(of([
      student({ id: 's-orphan', contact_id: 'nope' }), // no matching contact
      student({ id: 's-future', contact_id: 'c-2', package_start_date: '2026-09-01T00:00:00' }), // not started → $0
    ]));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data).toHaveLength(0);
  });

  it('renders a contact with missing name parts as a trimmed name', () => {
    contactService.getContacts.mockReturnValue(of([contact({ first_name: undefined, last_name: undefined })]));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data[0].name).toBe('');
  });

  it('exports a PDF covering monthly and semi-monthly rows', () => {
    const c = build();
    c.ngOnInit();
    (c as any).dataSource.data = [
      {
        name: 'Casey Lee', packages: 'Pat: Succeed', cycle: BillingCycle.MONTHLY,
        due_first: 362, due_fifteenth: null, total: 362,
      } as BillingEntry,
      {
        name: 'Sam Roe', packages: 'Kai: Thrive', cycle: BillingCycle.SEMI_MONTHLY,
        due_first: 181, due_fifteenth: 181, total: 362,
      } as BillingEntry,
      // Undefined amounts: due columns render blank ('—'), total uses the formatMoney `?? 0` fallback.
      {} as BillingEntry,
    ];
    c.exportPDF();

    const doc = (jsPDF as unknown as jest.Mock).mock.results.at(-1)!.value;
    expect(doc.text).toHaveBeenCalledWith('Beyond the Chalkboard Tutoring', 14, 16);
    expect(doc.text).toHaveBeenCalledWith('Billing: July 2026', 14, 23);
    expect(doc.save).toHaveBeenCalledWith('billing-July-2026.pdf');

    const config = (autoTable as unknown as jest.Mock).mock.calls.at(-1)![1];
    expect(config.head).toEqual([['Contact', 'Students', 'Cycle', 'Due 1st', 'Due 15th', 'Total']]);
    expect(config.body).toEqual([
      ['Casey Lee', 'Pat: Succeed', 'Monthly', '$362.00', '—', '$362.00'],
      ['Sam Roe', 'Kai: Thrive', 'Semi-monthly', '$181.00', '$181.00', '$362.00'],
      ['', '', 'Monthly', '—', '—', '$0.00'],
    ]);
  });
});
