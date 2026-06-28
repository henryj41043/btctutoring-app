import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { Billing } from './billing';
import { AuthService } from '../services/auth.service';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { BillingService } from '../services/billing.service';
import { Contact } from '../models/contact.model';
import { Student } from '../models/student.model';
import { BillingRecord } from '../models/billing-record.model';
import { Status } from '../enums/status.enum';
import { Package } from '../enums/package.enum';
import { BillingCycle } from '../enums/billing-cycle.enum';
import { Weekday } from '../enums/weekday.enum';

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

  it('persists a paid toggle and updates the row', () => {
    billingService.upsertBillingRecord.mockReturnValue(of({ id: 'c-1#2026-07-01' }));
    const c = build();
    c.ngOnInit();
    const entry = (c as any).dataSource.data[0];
    c.togglePaid(entry, 'first', true);
    expect(billingService.upsertBillingRecord).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: 'c-1', period_start: '2026-07-01', paid: true }),
    );
    expect(entry.paid_first).toBe(true);
  });

  it('survives a load error by showing an empty table', () => {
    contactService.getContacts.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    expect((c as any).dataSource.data).toHaveLength(0);
  });
});
