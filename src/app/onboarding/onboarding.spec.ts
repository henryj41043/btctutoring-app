import { TestBed } from '@angular/core/testing';
import { of, throwError, Subject } from 'rxjs';
import { Router } from '@angular/router';
import { MatTableDataSource } from '@angular/material/table';
import { Onboarding } from './onboarding';
import { StudentService } from '../services/student.service';
import { OnboardingRow } from '../models/onboarding-row.model';
import { Student } from '../models/student.model';
import { Status } from '../enums/status.enum';

describe('Onboarding', () => {
  const studentService = {
    getOnboardingStudents: jest.fn(),
    updateStudent: jest.fn(),
  };
  const router = { navigate: jest.fn() };

  const row = (over: Partial<OnboardingRow> = {}): OnboardingRow => ({
    id: 's-1',
    contact_id: 'c-1',
    name: 'Pat',
    status: 'Onboarding',
    onboarding_complete: false,
    contact_name: 'Ann Lee',
    ...over,
  });

  const build = (): Onboarding => {
    TestBed.configureTestingModule({
      imports: [Onboarding],
      providers: [
        { provide: StudentService, useValue: studentService },
        { provide: Router, useValue: router },
      ],
    });
    const c = TestBed.createComponent(Onboarding).componentInstance;
    c.ngOnInit();
    return c;
  };

  const data = (c: Onboarding): OnboardingRow[] =>
    (c as unknown as { dataSource: MatTableDataSource<OnboardingRow> }).dataSource.data;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    studentService.getOnboardingStudents.mockReturnValue(of([]));
  });

  it('loads onboarding rows and clears loading', () => {
    studentService.getOnboardingStudents.mockReturnValue(of([row(), row({ id: 's-2' })]));
    const c = build();
    expect(data(c)).toHaveLength(2);
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
  });

  it('wires sort and paginator into the data source once they exist', () => {
    const c = build();
    const ds = (c as unknown as { dataSource: MatTableDataSource<OnboardingRow> }).dataSource;
    const setters = c as unknown as { matSort: unknown; matPaginator: unknown };
    setters.matSort = 'SORT';
    setters.matPaginator = 'PAGINATOR';
    expect(ds.sort).toBe('SORT');
    expect(ds.paginator).toBe('PAGINATOR');
    // A null (not-yet-rendered) view child is a no-op, leaving the wiring intact.
    setters.matSort = null;
    setters.matPaginator = null;
    expect(ds.sort).toBe('SORT');
    expect(ds.paginator).toBe('PAGINATOR');
  });

  it('swallows a load error and clears loading', () => {
    studentService.getOnboardingStudents.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    expect((c as unknown as { loading: boolean }).loading).toBe(false);
    expect(data(c)).toEqual([]);
  });

  it('navigates to the family contact page on row click', () => {
    const c = build();
    c.openContact(row({ contact_id: 'c-9' }));
    expect(router.navigate).toHaveBeenCalledWith(['/contacts', 'c-9']);
  });

  it('completing onboarding advances the student to Active and drops the row', () => {
    studentService.getOnboardingStudents.mockReturnValue(of([row(), row({ id: 's-2' })]));
    const c = build();
    studentService.updateStudent.mockReturnValue(of({} as Student));
    c.completeOnboarding(row(), true);
    expect(studentService.updateStudent).toHaveBeenCalledWith({
      id: 's-1',
      contact_id: 'c-1',
      name: 'Pat',
      status: Status.ACTIVE_STUDENT,
      onboarding_complete: true,
    });
    expect(data(c).map(r => r.id)).toEqual(['s-2']);
    expect(c.isSaving(row())).toBe(false);
  });

  it('shows a spinner and blocks a re-click while completing', () => {
    studentService.getOnboardingStudents.mockReturnValue(of([row()]));
    const c = build();
    const inflight = new Subject<Student>();
    studentService.updateStudent.mockReturnValue(inflight.asObservable());
    c.completeOnboarding(row(), true);
    expect(c.isSaving(row())).toBe(true);
    c.completeOnboarding(row(), true);
    expect(studentService.updateStudent).toHaveBeenCalledTimes(1);
    inflight.next({} as Student);
    expect(c.isSaving(row())).toBe(false);
  });

  it('ignores an uncheck or a row with no id', () => {
    const c = build();
    c.completeOnboarding(row(), false);
    c.completeOnboarding(row({ id: undefined }), true);
    expect(studentService.updateStudent).not.toHaveBeenCalled();
  });

  it('keeps the row and clears saving when completion fails', () => {
    studentService.getOnboardingStudents.mockReturnValue(of([row()]));
    const c = build();
    studentService.updateStudent.mockReturnValue(throwError(() => new Error('x')));
    c.completeOnboarding(row(), true);
    expect(data(c)).toHaveLength(1);
    expect(c.isSaving(row())).toBe(false);
  });
});
