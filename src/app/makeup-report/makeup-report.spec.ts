import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MakeupReport, MakeupReportRow } from './makeup-report';
import { StudentService } from '../services/student.service';
import { Student } from '../models/student.model';

/** earned_date `days` ago as ISO. */
const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

const student = (over: Partial<Student> = {}): Student =>
  ({
    id: 's-1',
    contact_id: 'c-1',
    contact_name: 'Ada Lovelace',
    name: 'Pat',
    ...over,
  }) as Student;

describe('MakeupReport', () => {
  const studentService = { getStudents: jest.fn() };

  const build = (): MakeupReport => {
    TestBed.configureTestingModule({
      imports: [MakeupReport],
      providers: [{ provide: StudentService, useValue: studentService }],
    });
    return TestBed.createComponent(MakeupReport).componentInstance;
  };

  const rows = (c: MakeupReport): MakeupReportRow[] =>
    (c as unknown as { dataSource: { data: MakeupReportRow[] } }).dataSource.data;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    studentService.getStudents.mockReturnValue(of([]));
  });

  it('lists only students with an available balance, soonest expiry first', () => {
    studentService.getStudents.mockReturnValue(
      of([
        student({
          id: 's-later',
          make_up_batches: [{ minutes: 30, earned_date: daysAgo(10) }],
        }),
        student({
          id: 's-soon',
          make_up_batches: [{ minutes: 45, earned_date: daysAgo(80) }],
        }),
        student({ id: 's-none' }),
        student({
          id: 's-expired',
          make_up_batches: [{ minutes: 60, earned_date: daysAgo(120) }],
        }),
      ]),
    );
    const c = build();
    c.ngOnInit();

    expect(rows(c).map(r => r.student.id)).toEqual(['s-soon', 's-later']);
    expect(rows(c)[0].available).toBe(45);
    // 80 days old → expires in ~10 days.
    const msLeft = rows(c)[0].soonestExpiry!.getTime() - Date.now();
    expect(msLeft).toBeGreaterThan(9 * 24 * 60 * 60 * 1000);
    expect(msLeft).toBeLessThan(11 * 24 * 60 * 60 * 1000);
  });

  it('sinks never-expire students below dated expiries with a null expiry', () => {
    studentService.getStudents.mockReturnValue(
      of([
        student({
          id: 's-exempt',
          make_up_never_expire: true,
          make_up_batches: [{ minutes: 30, earned_date: daysAgo(200) }],
        }),
        student({
          id: 's-dated',
          make_up_batches: [{ minutes: 30, earned_date: daysAgo(30) }],
        }),
      ]),
    );
    const c = build();
    c.ngOnInit();

    expect(rows(c).map(r => r.student.id)).toEqual(['s-dated', 's-exempt']);
    expect(rows(c)[1].soonestExpiry).toBeNull();
    // Exempt batches still show detail (with a null expiry).
    expect(rows(c)[1].batches[0].expires).toBeNull();
  });

  it('flags legacy scalar-only balances (no batch detail)', () => {
    studentService.getStudents.mockReturnValue(
      of([student({ id: 's-legacy', make_up_minutes: 90 })]),
    );
    const c = build();
    c.ngOnInit();

    expect(rows(c)).toHaveLength(1);
    expect(rows(c)[0].legacy).toBe(true);
    expect(rows(c)[0].available).toBe(90);
    expect(rows(c)[0].batches).toEqual([]);
  });

  it('filters by parent or student name', () => {
    studentService.getStudents.mockReturnValue(
      of([
        student({ id: 's-1', make_up_batches: [{ minutes: 30, earned_date: daysAgo(5) }] }),
        student({
          id: 's-2',
          name: 'Zed',
          contact_name: 'Grace Hopper',
          make_up_batches: [{ minutes: 15, earned_date: daysAgo(5) }],
        }),
      ]),
    );
    const c = build();
    c.ngOnInit();
    c.applyFilter('grace');
    const ds = (c as unknown as { dataSource: { filteredData: MakeupReportRow[] } }).dataSource;
    expect(ds.filteredData.map(r => r.student.id)).toEqual(['s-2']);
  });

  it('toggles per-row expansion', () => {
    const c = build();
    const row = { student: student() } as MakeupReportRow;
    expect(c.isExpanded(row)).toBe(false);
    c.toggleExpanded(row);
    expect(c.isExpanded(row)).toBe(true);
    c.toggleExpanded(row);
    expect(c.isExpanded(row)).toBe(false);
  });

  it('orders never-expire rows among themselves by parent name', () => {
    studentService.getStudents.mockReturnValue(
      of([
        student({
          id: 's-z',
          contact_name: 'Zed Family',
          make_up_never_expire: true,
          make_up_batches: [{ minutes: 30, earned_date: daysAgo(5) }],
        }),
        student({
          id: 's-a',
          contact_name: undefined,
          make_up_never_expire: true,
          make_up_batches: [{ minutes: 30, earned_date: daysAgo(5) }],
        }),
      ]),
    );
    const c = build();
    c.ngOnInit();
    // Missing parent names sort as empty string — first.
    expect(rows(c).map(r => r.student.id)).toEqual(['s-a', 's-z']);
  });

  it('wires the paginator only once it exists', () => {
    const c = build();
    c.matPaginator = null as never;
    const ds = (c as unknown as { dataSource: { paginator: unknown } }).dataSource;
    expect(ds.paginator).toBeFalsy();
    const paginator = {} as never;
    c.matPaginator = paginator;
    expect(ds.paginator).toBe(paginator);
  });

  it('clears the spinner on a load error', () => {
    studentService.getStudents.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    c.ngOnInit();
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
    expect(rows(c)).toEqual([]);
  });
});
