import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Payroll } from './payroll';
import { AuthService } from '../services/auth.service';
import { SessionsService } from '../services/sessions.service';
import { ContactService } from '../services/contact.service';
import { Contact } from '../models/contact.model';
import { Session } from '../models/session.model';
import { PayrollEntry } from '../models/payroll-entry.model';
import { Service } from '../enums/service.enum';
import { Status } from '../enums/status.enum';
import { SessionStatus } from '../enums/session-status.enum';
import { SessionType } from '../enums/session-type.enum';

jest.mock('jspdf', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    setFontSize: jest.fn(),
    setFont: jest.fn(),
    text: jest.fn(),
    setTextColor: jest.fn(),
    getNumberOfPages: jest.fn(() => 2),
    setPage: jest.fn(),
    save: jest.fn(),
    internal: { pageSize: { getWidth: () => 300, getHeight: () => 200 } },
  })),
}));
jest.mock('jspdf-autotable', () => ({ __esModule: true, default: jest.fn() }));

const staffContact = (over: Partial<Contact> = {}): Contact =>
  ({
    id: 'c-1',
    first_name: 'Tess',
    hourly_rate: 40,
    service: Service.HIRING,
    status: Status.STAFF,
    ...over,
  }) as Contact;

describe('Payroll', () => {
  let isAdmin: boolean;
  let self: Contact;
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => self,
  };
  const sessionsService = { getSessionsByTutor: jest.fn() };
  const contactService = { getContacts: jest.fn() };

  const build = (): Payroll => {
    TestBed.configureTestingModule({
      imports: [Payroll],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: ContactService, useValue: contactService },
      ],
    });
    return TestBed.createComponent(Payroll).componentInstance;
  };

  const data = (p: Payroll) =>
    (p as unknown as { dataSource: { data: PayrollEntry[] } }).dataSource.data;
  const priv = (p: Payroll) =>
    p as unknown as { startDate?: Date; endDate?: Date; loading: boolean };

  beforeEach(() => {
    isAdmin = false;
    self = staffContact();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('computes a tutor payroll entry from completed and admin sessions', () => {
    sessionsService.getSessionsByTutor.mockReturnValue(
      of([
        {
          type: SessionType.ADMIN,
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-06-05T09:00:00',
          end_datetime: '2026-06-05T10:00:00',
        },
        {
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-06-06T09:00:00',
          end_datetime: '2026-06-06T11:00:00',
        },
        {
          type: SessionType.TUTORING,
          status: SessionStatus.PENDING,
          start_datetime: '2026-06-06T12:00:00',
          end_datetime: '2026-06-06T13:00:00',
        },
        {
          // Outside the pay-period window -> contributes zero.
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-05-01T09:00:00',
          end_datetime: '2026-05-01T11:00:00',
        },
      ] as Session[]),
    );

    const p = build();
    p.onDateChange(new Date(2026, 5, 10));

    const entry = data(p)[0];
    expect(entry.administrative_time).toBe(1);
    expect(entry.tutoring_hours).toBe(2);
    expect(entry.hours_subtotal).toBe(3);
    expect(entry.tutoring_compensation).toBe(120);
    expect(entry.total_compensation).toBeCloseTo(124.95, 2);
    expect(priv(p).loading).toBe(false);
  });

  it('returns a zeroed entry when fetching a tutor’s sessions fails', () => {
    sessionsService.getSessionsByTutor.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    const p = build();
    p.onDateChange(new Date(2026, 5, 10));
    expect(data(p)[0].tutoring_hours).toBe(0);
  });

  it('shows nothing when a non-admin has no contact record', () => {
    self = { id: undefined } as Contact;
    const p = build();
    p.ngOnInit();
    expect(data(p)).toEqual([]);
  });

  it('wires sort and paginator through the view-child setters', () => {
    const p = build();
    const ds = (p as unknown as { dataSource: { sort: unknown; paginator: unknown } }).dataSource;
    const sort = {} as never;
    const paginator = {} as never;
    (p as unknown as { matSort: unknown }).matSort = sort;
    (p as unknown as { matPaginator: unknown }).matPaginator = paginator;
    expect(ds.sort).toBe(sort);
    expect(ds.paginator).toBe(paginator);
    // Null setters are ignored (the table lives inside an @if).
    (p as unknown as { matSort: unknown }).matSort = undefined;
    (p as unknown as { matPaginator: unknown }).matPaginator = undefined;
    expect(ds.sort).toBe(sort);
    expect(ds.paginator).toBe(paginator);
  });

  it('ignores a null date change', () => {
    const p = build();
    sessionsService.getSessionsByTutor.mockReturnValue(of([]));
    p.onDateChange(null);
    expect(sessionsService.getSessionsByTutor).not.toHaveBeenCalled();
  });

  it('uses the first half of the month for an early date and the second half later', () => {
    sessionsService.getSessionsByTutor.mockReturnValue(of([]));
    const p = build();
    p.onDateChange(new Date(2026, 5, 10));
    expect(priv(p).startDate).toEqual(new Date(2026, 5, 1));
    p.onDateChange(new Date(2026, 5, 20));
    expect(priv(p).startDate).toEqual(new Date(2026, 5, 16));
  });

  describe('admin payroll', () => {
    beforeEach(() => {
      isAdmin = true;
    });

    it('builds an entry per staff tutor', () => {
      contactService.getContacts.mockReturnValue(
        of([
          staffContact({ id: 'c-1', hourly_rate: undefined }), // exercises `?? 0`
          staffContact({ id: 'c-2', service: Service.TUTORING }), // not staff
        ]),
      );
      sessionsService.getSessionsByTutor.mockReturnValue(of([]));

      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p)).toHaveLength(1);
    });

    it('shows nothing when there are no staff tutors', () => {
      contactService.getContacts.mockReturnValue(
        of([staffContact({ status: Status.ACTIVE_STUDENT })]),
      );
      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p)).toEqual([]);
    });

    it('shows nothing when loading contacts fails', () => {
      contactService.getContacts.mockReturnValue(
        throwError(() => new Error('boom')),
      );
      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p)).toEqual([]);
      expect(priv(p).loading).toBe(false);
    });
  });

  describe('exportPDF', () => {
    it('renders a PDF with a populated date range', () => {
      sessionsService.getSessionsByTutor.mockReturnValue(of([]));
      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      // Populate rows: one fully-specified entry and one with undefined fields
      // to exercise the `?? ''` / `?? 0` fallbacks in the row mapping.
      (p as unknown as { dataSource: { data: PayrollEntry[] } }).dataSource.data = [
        {
          name: 'Tess',
          tutoring_hours: 2,
          administrative_time: 1,
          hours_subtotal: 3,
          pay_rate: 40,
          tutoring_compensation: 120,
          planning_time: 0.33,
          planning_rate: 15,
          planning_compensation: 4.95,
          total_compensation: 124.95,
        },
        {} as PayrollEntry,
      ];

      p.exportPDF();

      expect(jsPDF).toHaveBeenCalled();
      expect(autoTable).toHaveBeenCalled();
      const doc = (jsPDF as unknown as jest.Mock).mock.results.at(-1)!.value;
      expect(doc.save).toHaveBeenCalled();
      expect(doc.setPage).toHaveBeenCalledTimes(2);
    });

    it('tolerates an unset date range', () => {
      const p = build();
      expect(() => p.exportPDF()).not.toThrow();
      expect(autoTable).toHaveBeenCalled();
    });
  });
});
