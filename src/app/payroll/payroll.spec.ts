import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, throwError } from 'rxjs';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Payroll } from './payroll';
import { AuthService } from '../services/auth.service';
import { SessionsService } from '../services/sessions.service';
import { ContactService } from '../services/contact.service';
import { StudentService } from '../services/student.service';
import { Student } from '../models/student.model';
import { Contact } from '../models/contact.model';
import { Session } from '../models/session.model';
import { PayrollEntry } from '../models/payroll-entry.model';
import { Service } from '../enums/service.enum';
import { StudentStatus } from '../enums/student-status.enum';
import { StaffStatus } from '../enums/staff-status.enum';
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
    status: StaffStatus.ACTIVE_STAFF,
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
    sessionStorage.clear();
    isAdmin = false;
    self = staffContact();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    studentService.getStudents.mockReturnValue(of([]));
    studentService.getStudentsByTutor.mockReturnValue(of([]));
    sessionsService.getAllSessions.mockReturnValue(of([]));
  });

  it('restores the saved month and ignores corrupt saved dates', () => {
    sessionStorage.setItem('btc-payroll-view',
      JSON.stringify({ extra: { selectedDate: new Date(2026, 2, 10).toISOString() } }));
    const c1 = build();
    c1.ngOnInit();
    expect((c1 as any).selectedDate.getMonth()).toBe(2); // March restored
    TestBed.resetTestingModule();

    sessionStorage.setItem('btc-payroll-view', JSON.stringify({ extra: { selectedDate: 'not-a-date' } }));
    const c2 = build();
    const before = (c2 as any).selectedDate.getMonth();
    c2.ngOnInit();
    expect((c2 as any).selectedDate.getMonth()).toBe(before); // untouched

    c2.onDateChange(new Date(2026, 4, 1));
    expect(JSON.parse(sessionStorage.getItem('btc-payroll-view')!).extra.selectedDate)
      .toBe(new Date(2026, 4, 1).toISOString());
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

  it('pays a flat hour per held trial and keeps trials out of planning time', () => {
    sessionsService.getSessionsByTutor.mockReturnValue(
      of([
        {
          // Completed 45-min trial in the window -> flat 1.0 trial hour.
          type: SessionType.TRIAL,
          status: SessionStatus.COMPLETED,
          student_id: 's-1',
          start_datetime: '2026-06-05T10:00:00',
          end_datetime: '2026-06-05T10:45:00',
        },
        {
          // NCNS trial also pays the flat hour (tutor held the slot).
          type: SessionType.TRIAL,
          status: SessionStatus.NO_CALL_NO_SHOW,
          student_id: 's-2',
          start_datetime: '2026-06-06T10:00:00',
          end_datetime: '2026-06-06T10:45:00',
        },
        {
          // Cancelled trial pays nothing.
          type: SessionType.TRIAL,
          status: SessionStatus.CANCELLED,
          start_datetime: '2026-06-07T10:00:00',
          end_datetime: '2026-06-07T10:45:00',
        },
        {
          // Out-of-window trial contributes zero.
          type: SessionType.TRIAL,
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-05-01T10:00:00',
          end_datetime: '2026-05-01T10:45:00',
        },
        {
          // A normal completed tutoring hour keeps the planning math visible.
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-06-08T10:00:00',
          end_datetime: '2026-06-08T11:00:00',
        },
      ] as Session[]),
    );

    const p = build();
    p.onDateChange(new Date(2026, 5, 10));

    const entry = data(p)[0];
    expect(entry.trial_hours).toBe(2); // completed + NCNS, flat 1.0 each
    expect(entry.tutoring_hours).toBe(1); // trials never join tutoring hours
    // Planning derives from tutoring hours only: 1/6 h.
    expect(entry.planning_time).toBeCloseTo(0.17, 2);
    expect(entry.hours_subtotal).toBe(3); // 1 tutoring + 0 admin + 2 trial
    // 3h x $40 = $120 at the regular rate — the flat trial hours are in.
    expect(entry.tutoring_compensation).toBe(120);
  });

  it('pays a flat hour per held BTC & Me group session, per session not per student', () => {
    sessionsService.getSessionsByTutor.mockReturnValue(
      of([
        {
          // Completed 45-min group with 3 students -> ONE flat hour.
          type: SessionType.GROUP,
          status: SessionStatus.COMPLETED,
          student_name: 'Ava, Ben, Cy',
          participants: [
            {id: 's-a', name: 'Ava'},
            {id: 's-b', name: 'Ben'},
            {id: 's-c', name: 'Cy'},
          ],
          start_datetime: '2026-06-05T10:00:00',
          end_datetime: '2026-06-05T10:45:00',
        },
        {
          // NCNS group also pays the flat hour (tutor held the slot).
          type: SessionType.GROUP,
          status: SessionStatus.NO_CALL_NO_SHOW,
          start_datetime: '2026-06-06T10:00:00',
          end_datetime: '2026-06-06T10:45:00',
        },
        {
          // Pending and cancelled groups pay nothing.
          type: SessionType.GROUP,
          status: SessionStatus.PENDING,
          start_datetime: '2026-06-07T10:00:00',
          end_datetime: '2026-06-07T10:45:00',
        },
        {
          type: SessionType.GROUP,
          status: SessionStatus.CANCELLED,
          start_datetime: '2026-06-08T10:00:00',
          end_datetime: '2026-06-08T10:45:00',
        },
        {
          // Out-of-window group contributes zero.
          type: SessionType.GROUP,
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-05-01T10:00:00',
          end_datetime: '2026-05-01T10:45:00',
        },
        {
          // A normal completed tutoring hour keeps the planning math visible.
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          start_datetime: '2026-06-09T10:00:00',
          end_datetime: '2026-06-09T11:00:00',
        },
      ] as Session[]),
    );

    const p = build();
    p.onDateChange(new Date(2026, 5, 10));

    const entry = data(p)[0];
    expect(entry.group_hours).toBe(2); // completed + NCNS, flat 1.0 each
    expect(entry.tutoring_hours).toBe(1); // groups never join tutoring hours
    // Planning derives from tutoring hours only — groups earn no credit.
    expect(entry.planning_time).toBeCloseTo(0.17, 2);
    expect(entry.hours_subtotal).toBe(3); // 1 tutoring + 2 group
    expect(entry.tutoring_compensation).toBe(120); // 3h x $40
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

  it('a per-tutor override wins over the student default for THIS tutor', () => {
    // self is 'c-1'; the student's default is 20 but c-1's override is 45.
    studentService.getStudentsByTutor.mockReturnValue(
      of([
        {
          id: 's-1', name: 'Pat', extra_planning_minutes: 20,
          extra_planning_by_tutor: [
            { tutor_id: 'c-1', minutes: 45 },
            { tutor_id: 'c-other', minutes: 5 }, // someone else's override — ignored
          ],
        },
      ] as Student[]),
    );
    sessionsService.getSessionsByTutor.mockReturnValue(
      of([
        {
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          student_id: 's-1',
          start_datetime: '2026-06-06T09:00:00',
          end_datetime: '2026-06-06T10:00:00',
        },
      ] as Session[]),
    );
    const p = build();
    p.onDateChange(new Date(2026, 5, 10));
    const entry = data(p)[0];
    // 1 counted session x 45 min override = 0.75 h (not 20 min = 0.33 h).
    expect(entry.extra_planning_time).toBeCloseTo(0.75, 2);
  });

  it('a tutor without an override earns the student default (other tutors overridden)', () => {
    studentService.getStudentsByTutor.mockReturnValue(
      of([
        {
          id: 's-1', name: 'Pat', extra_planning_minutes: 20,
          extra_planning_by_tutor: [{ tutor_id: 'c-other', minutes: 45 }],
        },
      ] as Student[]),
    );
    sessionsService.getSessionsByTutor.mockReturnValue(
      of([
        {
          type: SessionType.TUTORING,
          status: SessionStatus.COMPLETED,
          student_id: 's-1',
          start_datetime: '2026-06-06T09:00:00',
          end_datetime: '2026-06-06T10:00:00',
        },
      ] as Session[]),
    );
    const p = build();
    p.onDateChange(new Date(2026, 5, 10));
    // 1 session x 20 min default = 0.33 h.
    expect(data(p)[0].extra_planning_time).toBeCloseTo(0.33, 2);
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
          hire_type: '1099',
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
        head: unknown[][];
        body: unknown[][];
        foot: unknown[][];
        showFoot: string;
        footStyles: { fillColor: number[] };
      };
      // Exact head pins every column's position (13 with BTC & Me).
      expect(tableArgs.head).toEqual([[
        'Staff Name', 'Hire Type', 'Tutoring (hrs)', 'Trials (hrs)', 'BTC & Me (hrs)',
        'Admin (hrs)', 'Subtotal (hrs)', 'Pay Rate', 'Tutoring Comp', 'Planning (hrs)',
        'Planning Rate', 'Planning Comp', 'Total Comp',
      ]]);
      expect(tableArgs.body[0][1]).toBe('1099');
      expect(tableArgs.body[1][1]).toBe(''); // `?? ''` fallback
      expect(tableArgs.body[0]).toContain('0.33 +0.5');
      // Grand total of Total Comp in the last cell of a 13-cell foot, last page only.
      expect(tableArgs.foot).toEqual([
        // hire_type and the two rate columns stay blank; planning hours
        // include the extra credit (0.33 + 0.5).
        ['Grand Total', '', 2, 0, 0, 1, 3, '', '$120.00', 0.83, '', '$4.95', '$124.95'],
      ]);
      expect(tableArgs.showFoot).toBe('lastPage');
      expect(tableArgs.footStyles).toEqual({ fillColor: [17, 138, 178] });
    });

    it('tolerates an unset date range', () => {
      const p = build();
      expect(() => p.exportPDF()).not.toThrow();
      expect(autoTable).toHaveBeenCalled();
    });
  });

  describe('grand total', () => {
    const totals = (p: Payroll) => p as unknown as { grandTotalComp: number };

    it('sums total compensation across all rows, re-rounded', () => {
      const p = build();
      // 0.1 + 0.2 is 0.30000000000000004 unrounded — pins the round2 wrapper.
      (p as unknown as { dataSource: { data: PayrollEntry[] } }).dataSource.data = [
        { total_compensation: 0.1 } as PayrollEntry,
        { total_compensation: 0.2 } as PayrollEntry,
        {} as PayrollEntry, // `?? 0` fallback
      ];
      expect(totals(p).grandTotalComp).toBe(0.3);
    });

    it('is zero with no rows', () => {
      const p = build();
      expect(totals(p).grandTotalComp).toBe(0);
    });

    it('sums every hours and comp column, re-rounded', () => {
      const p = build();
      (p as unknown as { dataSource: { data: PayrollEntry[] } }).dataSource.data = [
        {
          tutoring_hours: 0.1, trial_hours: 1, administrative_time: 0.1,
          hours_subtotal: 1.2, planning_time: 0.1, extra_planning_time: 0.5,
          tutoring_compensation: 0.1, planning_compensation: 0.2,
        } as PayrollEntry,
        {
          tutoring_hours: 0.2, administrative_time: 0.2, hours_subtotal: 0.4,
          planning_time: 0.2, tutoring_compensation: 0.2, planning_compensation: 0.1,
        } as PayrollEntry,
        {} as PayrollEntry, // every `?? 0` fallback
      ];
      const t = p as unknown as {
        grandTutoringHours: number; grandTrialHours: number; grandAdminTime: number;
        grandHoursSubtotal: number; grandPlanningTime: number;
        grandTutoringComp: number; grandPlanningComp: number;
      };
      // 0.1 + 0.2 is 0.30000000000000004 unrounded — pins the round2 wrapper.
      expect(t.grandTutoringHours).toBe(0.3);
      expect(t.grandTrialHours).toBe(1);
      expect(t.grandAdminTime).toBe(0.3);
      expect(t.grandHoursSubtotal).toBe(1.6);
      expect(t.grandPlanningTime).toBe(0.8); // includes the extra credit
      expect(t.grandTutoringComp).toBe(0.3);
      expect(t.grandPlanningComp).toBe(0.3);
    });
  });

  describe('hire type', () => {
    it('carries the staff contact hire type onto admin-path entries', () => {
      isAdmin = true;
      contactService.getStaff.mockReturnValue(
        of([staffContact({ hire_type: '1099' })]),
      );
      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p)[0].hire_type).toBe('1099');
    });

    it('carries the own contact hire type on the self path', () => {
      self = staffContact({ hire_type: 'W2' });
      sessionsService.getSessionsByTutor.mockReturnValue(of([]));
      const p = build();
      p.onDateChange(new Date(2026, 5, 10));
      expect(data(p)[0].hire_type).toBe('W2');
    });

    // Rendered against the template so a missing matFooterCellDef (a runtime
    // error mat-table throws) cannot slip through — no e2e visits this page.
    it('renders the hire type column and footer grand-total row', () => {
      isAdmin = true;
      contactService.getStaff.mockReturnValue(
        of([staffContact({ hire_type: 'W2' })]),
      );
      TestBed.configureTestingModule({
        imports: [Payroll],
        providers: [
          provideNoopAnimations(),
          { provide: AuthService, useValue: authService },
          { provide: SessionsService, useValue: sessionsService },
          { provide: ContactService, useValue: contactService },
          { provide: StudentService, useValue: studentService },
        ],
      });
      const fixture = TestBed.createComponent(Payroll);
      fixture.componentInstance.onDateChange(new Date(2026, 5, 10));
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('Hire Type');
      expect(text).toContain('W2');
      expect(text).toContain('Grand Total');
    });

    // Same render guard for the new BTC & Me column's cell + footer wiring.
    it('renders the BTC & Me hours column and its footer total', () => {
      isAdmin = true;
      contactService.getStaff.mockReturnValue(of([staffContact()]));
      sessionsService.getAllSessions.mockReturnValue(of([
        {
          type: SessionType.GROUP,
          status: SessionStatus.COMPLETED,
          tutor_id: 't-1',
          start_datetime: '2026-06-05T10:00:00',
          end_datetime: '2026-06-05T10:45:00',
        },
      ] as Session[]));
      TestBed.configureTestingModule({
        imports: [Payroll],
        providers: [
          provideNoopAnimations(),
          { provide: AuthService, useValue: authService },
          { provide: SessionsService, useValue: sessionsService },
          { provide: ContactService, useValue: contactService },
          { provide: StudentService, useValue: studentService },
        ],
      });
      const fixture = TestBed.createComponent(Payroll);
      fixture.componentInstance.onDateChange(new Date(2026, 5, 10));
      fixture.detectChanges();
      const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
      expect(text).toContain('BTC & Me (hrs)');
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
