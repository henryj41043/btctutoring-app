import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Payroll } from './payroll';
import { AuthService } from '../services/auth.service';
import { SessionsService } from '../services/sessions.service';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { Contact } from '../models/contact.model';
import { Session } from '../models/session.model';
import { PayrollEntry } from '../models/payroll-entry.model';
import { Service } from '../enums/service.enum';
import { StudentStatus } from '../enums/student-status.enum';
import { ContactStatus } from '../enums/contact-status.enum';
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
    status: ContactStatus.STAFF,
    ...over,
  }) as Contact;

describe('Payroll', () => {
  let isAdmin: boolean;
  let self: Contact;
  const authService = {
    isAdmin: () => isAdmin,
    contact: () => self,
  };
  const sessionsService = { getSessionsByTutor: jest.fn(), getAllSessions: jest.fn() };
  const contactService = { getContacts: jest.fn(), getStaff: jest.fn() };
  const studentService = { getStudents: jest.fn(), getStudentsByTutor: jest.fn() };

  const build = (): Payroll => {
    TestBed.configureTestingModule({
      imports: [Payroll],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SessionsService, useValue: sessionsService },
        { provide: ContactService, useValue: contactService },
        { provide: StudentService, useValue: studentService },
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
    studentService.getStudents.mockReturnValue(of([]));
    studentService.getStudentsByTutor.mockReturnValue(of([]));
    sessionsService.getAllSessions.mockReturnValue(of([]));
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

  it('credits extra planning minutes per counted session for tagged students', () => {
    studentService.getStudentsByTutor.mockReturnValue(
      of([
        { id: 's-1', name: 'Pat', extra_planning_minutes: 20 },
        { id: 's-2', name: 'Sam' }, // untagged
      ]),
    );
    sessionsService.getSessionsByTutor.mockReturnValue(
      of([
        {
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          student_id: 's-1',
          start_datetime: '2026-06-06T09:00:00',
          end_datetime: '2026-06-06T11:00:00',
        },
        {
          type: SessionType.TUTORING,
          status: SessionStatus.NO_CALL_NO_SHOW,
          student_id: 's-1',
          start_datetime: '2026-06-07T09:00:00',
          end_datetime: '2026-06-07T10:00:00',
        },
        {
          // Pending sessions never earn the credit.
          type: SessionType.TUTORING,
          status: SessionStatus.PENDING,
          student_id: 's-1',
          start_datetime: '2026-06-08T09:00:00',
          end_datetime: '2026-06-08T10:00:00',
        },
        {
          // Outside the pay period -> no hours, no credit.
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          student_id: 's-1',
          start_datetime: '2026-05-01T09:00:00',
          end_datetime: '2026-05-01T10:00:00',
        },
        {
          // Untagged student -> hours count, no credit.
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          student_id: 's-2',
          start_datetime: '2026-06-09T09:00:00',
          end_datetime: '2026-06-09T10:00:00',
        },
      ] as Session[]),
    );

    const p = build();
    p.onDateChange(new Date(2026, 5, 10));

    const entry = data(p)[0];
    expect(entry.tutoring_hours).toBe(4);
    // 2 counted sessions with the tagged student x 20 min = 40 min = 0.67 h.
    expect(entry.extra_planning_time).toBeCloseTo(0.67, 2);
    expect(entry.planning_time).toBeCloseTo(0.67, 2); // 4h / 6
    // (0.67 + 0.67) x $15
    expect(entry.planning_compensation).toBeCloseTo(20.1, 2);
    expect(entry.total_compensation).toBeCloseTo(160 + 20.1, 2);
  });

  it('degrades to zero extra credit when the student fetch fails', () => {
    studentService.getStudentsByTutor.mockReturnValue(
      throwError(() => new Error('boom')),
    );
    sessionsService.getSessionsByTutor.mockReturnValue(
      of([
        {
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          student_id: 's-1',
          start_datetime: '2026-06-06T09:00:00',
          end_datetime: '2026-06-06T11:00:00',
        },
      ] as Session[]),
    );
    const p = build();
    p.onDateChange(new Date(2026, 5, 10));
    const entry = data(p)[0];
    expect(entry.tutoring_hours).toBe(2);
    expect(entry.extra_planning_time).toBe(0);
    // 2h x $40 + (2/6 h) x $15 — no extra credit applied.
    expect(entry.total_compensation).toBeCloseTo(84.95, 2);
  });

  it('formats the planning cell with the +extra suffix only when credited', () => {
    const p = build() as unknown as { formatPlanningTime(e: PayrollEntry): string };
    expect(p.formatPlanningTime({ planning_time: 2.33, extra_planning_time: 0.5 })).toBe('2.33 +0.5');
    expect(p.formatPlanningTime({ planning_time: 2.33 })).toBe('2.33');
    expect(p.formatPlanningTime({ planning_time: 2.33, extra_planning_time: 0 })).toBe('2.33');
    expect(p.formatPlanningTime({})).toBe('0');
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
      contactService.getStaff.mockReturnValue(
        of([
          staffContact({ id: 'c-1', hourly_rate: undefined }), // exercises `?? 0`
          staffContact({ id: 'c-2', service: Service.TUTORING }), // not staff
        ]),
      );
      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p)).toHaveLength(1);
      // One range-scoped fetch for the whole staff - never per tutor.
      expect(sessionsService.getAllSessions).toHaveBeenCalledTimes(1);
      expect(sessionsService.getSessionsByTutor).not.toHaveBeenCalled();
    });

    it('groups the single sessions fetch per tutor', () => {
      contactService.getStaff.mockReturnValue(
        of([staffContact({ id: 'c-1' }), staffContact({ id: 'c-2' })]),
      );
      sessionsService.getAllSessions.mockReturnValue(
        of([
          {
            tutor_id: 'c-1',
            type: SessionType.TUTORING,
            status: SessionStatus.COMPLETED,
            start_datetime: '2026-06-06T09:00:00',
            end_datetime: '2026-06-06T11:00:00',
          },
          {
            tutor_id: 'c-2',
            type: SessionType.TUTORING,
            status: SessionStatus.COMPLETED,
            start_datetime: '2026-06-06T09:00:00',
            end_datetime: '2026-06-06T10:00:00',
          },
          {
            // No tutor id -> attributed to nobody.
            type: SessionType.TUTORING,
            status: SessionStatus.COMPLETED,
            start_datetime: '2026-06-06T09:00:00',
            end_datetime: '2026-06-06T10:00:00',
          },
        ] as Session[]),
      );

      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p).map(e => e.tutoring_hours)).toEqual([2, 1]);
    });

    it('shows nothing when there are no staff tutors', () => {
      contactService.getStaff.mockReturnValue(
        of([staffContact({ status: StudentStatus.ACTIVE_STUDENT })]),
      );
      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p)).toEqual([]);
    });

    it('shows nothing when loading contacts fails', () => {
      contactService.getStaff.mockReturnValue(
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
          extra_planning_time: 0.5,
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
      const tableArgs = (autoTable as unknown as jest.Mock).mock.calls.at(-1)![1] as {
        body: unknown[][];
      };
      expect(tableArgs.body[0]).toContain('0.33 +0.5');
    });

    it('tolerates an unset date range', () => {
      const p = build();
      expect(() => p.exportPDF()).not.toThrow();
      expect(autoTable).toHaveBeenCalled();
    });
  });

  it('fetches only the selected pay period of sessions per tutor', () => {
    contactService.getStaff.mockReturnValue(of([staffContact()]));
    sessionsService.getSessionsByTutor.mockReturnValue(of([]));
    const c = build();
    c.onDateChange(new Date(2026, 6, 15)); // Jul 1–15 period
    const [tutorId, range] = sessionsService.getSessionsByTutor.mock.calls.at(-1)!;
    expect(tutorId).toBeDefined();
    expect(new Date(range.from).getDate()).toBe(1);
    expect(new Date(range.to).getDate()).toBe(15);
  });
});
