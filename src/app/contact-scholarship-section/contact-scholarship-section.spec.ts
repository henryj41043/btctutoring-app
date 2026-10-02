import {TestBed} from '@angular/core/testing';
import {of, throwError} from 'rxjs';
import {ContactScholarshipSection, SCHOLARSHIP_MONTHS_AHEAD} from './contact-scholarship-section';
import {ScholarshipService} from '../services/scholarship.service';
import {AuthService} from '../services/auth.service';
import {ScholarshipRecord} from '../models/scholarship-record.model';

const record = (over: Partial<ScholarshipRecord> = {}): ScholarshipRecord => ({
  contact_id: 'c-1',
  month: '2026-07',
  scholarship_state: 'PA',
  invoice_Month: 'July',
  invoice_number: 'INV-7',
  ...over,
});

describe('ContactScholarshipSection', () => {
  let isAdmin: boolean;
  const scholarshipService = {
    getScholarshipRecordsByContact: jest.fn(),
    upsertScholarshipRecord: jest.fn(),
  };
  const authService = {isAdmin: () => isAdmin};

  const build = (): ContactScholarshipSection => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ContactScholarshipSection],
      providers: [
        {provide: ScholarshipService, useValue: scholarshipService},
        {provide: AuthService, useValue: authService},
      ],
    });
    const c = TestBed.createComponent(ContactScholarshipSection).componentInstance;
    c.contactId = 'c-1';
    c.ngOnInit();
    return c;
  };

  const priv = (c: ContactScholarshipSection) => c as unknown as {
    monthOptions: string[];
    upcomingMonths: string[];
    selectedMonth: string;
    scholarshipForm: {value: Record<string, unknown>; get(name: string): {value: unknown} | null};
    saving: boolean;
    savedSuccessfully: boolean;
    hasError: boolean;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 7, 24)); // Aug 24 2026
    isAdmin = true;
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([record()]));
    scholarshipService.upsertScholarshipRecord.mockReturnValue(of({id: 'x'}));
  });

  afterEach(() => jest.useRealTimers());

  it('loads nothing for non-admins', () => {
    isAdmin = false;
    build();
    expect(scholarshipService.getScholarshipRecordsByContact).not.toHaveBeenCalled();
  });

  it('builds month options: record months plus the current month, newest first', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([
      record({month: '2026-06'}),
      record({month: '2026-07'}),
    ]));
    const c = build();
    expect(priv(c).monthOptions).toEqual(['2026-08', '2026-07', '2026-06']);
    expect(priv(c).selectedMonth).toBe('2026-08');
    expect(priv(c).upcomingMonths).toHaveLength(12);
  });

  const NEXT_TWELVE = [
    '2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02',
    '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08',
  ];

  it('offers the next twelve months, soonest first', () => {
    expect(SCHOLARSHIP_MONTHS_AHEAD).toBe(12);
    const c = build();
    expect(priv(c).upcomingMonths).toEqual(NEXT_TWELVE);
    expect(priv(c).monthOptions).toEqual(['2026-08', '2026-07']);
  });

  it('keeps a recorded month beyond the twelve, and never lists a future month as earlier', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([
      record({month: '2027-11'}),
      record({month: '2026-10'}),
      record({month: '2026-08'}),
      record({month: undefined}),
    ]));
    const c = build();
    expect(priv(c).upcomingMonths).toEqual([...NEXT_TWELVE, '2027-11']);
    expect(priv(c).monthOptions).toEqual(['2026-08']);
    expect(c.hasRecord('2026-10')).toBe(true);
    expect(c.hasRecord('2026-09')).toBe(false);
  });

  it('saves a record for a month picked in advance and marks it saved', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([]));
    const c = build();
    c.onMonthChange('2026-11');
    expect(priv(c).scholarshipForm.value['scholarship_state']).toBe('');
    (c as never as {scholarshipForm: {patchValue(v: Record<string, unknown>): void}})
      .scholarshipForm.patchValue({scholarship_state: 'PA'});
    c.save();
    expect(scholarshipService.upsertScholarshipRecord).toHaveBeenCalledWith(
      expect.objectContaining({contact_id: 'c-1', month: '2026-11', scholarship_state: 'PA'}),
    );
    expect(c.hasRecord('2026-11')).toBe(true);
    expect(priv(c).upcomingMonths).toEqual(NEXT_TWELVE);
    expect(priv(c).monthOptions).toEqual(['2026-08']);
  });

  it('lists the months in two groups, with saved upcoming months marked', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([
      record({month: '2026-10'}),
      record({month: '2026-07'}),
    ]));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [ContactScholarshipSection],
      providers: [
        {provide: ScholarshipService, useValue: scholarshipService},
        {provide: AuthService, useValue: authService},
      ],
    });
    const fixture = TestBed.createComponent(ContactScholarshipSection);
    fixture.componentRef.setInput('contactId', 'c-1');
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('mat-select') as HTMLElement).click();
    fixture.detectChanges();
    const groups = Array.from(document.querySelectorAll('mat-optgroup'));
    const labels = (group: Element) =>
      Array.from(group.querySelectorAll('mat-option')).map(o => o.textContent?.replace(/\s+/g, ' ').trim());
    expect(groups.map(g => g.querySelector('.mat-mdc-optgroup-label')?.textContent?.trim()))
      .toEqual(['Upcoming', 'Current and earlier']);
    expect(labels(groups[0]).slice(0, 3)).toEqual(['September 2026', 'October 2026 · saved', 'November 2026']);
    expect(labels(groups[0])).toHaveLength(12);
    expect(labels(groups[1])).toEqual(['August 2026', 'July 2026']);
  });

  it('defaults to the current month as a blank form when it has no record', () => {
    const c = build();
    expect(priv(c).scholarshipForm.value['scholarship_state']).toBe('');
    expect(priv(c).scholarshipForm.value['invoice_number']).toBe('');
  });

  it('selecting a recorded month patches its values into the form', () => {
    const c = build();
    c.onMonthChange('2026-07');
    expect(priv(c).scholarshipForm.value['scholarship_state']).toBe('PA');
    expect(priv(c).scholarshipForm.value['invoice_number']).toBe('INV-7');
  });

  it('normalizes API date values into Date objects for the pickers', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([
      record({invoice_paid_date: '2026-07-15T00:00:00.000Z' as never}),
    ]));
    const c = build();
    c.onMonthChange('2026-07');
    expect(priv(c).scholarshipForm.value['invoice_paid_date']).toBeInstanceOf(Date);
  });

  it('switching back to an empty month resets the form', () => {
    const c = build();
    c.onMonthChange('2026-07');
    c.onMonthChange('2026-08');
    expect(priv(c).scholarshipForm.value['scholarship_state']).toBe('');
  });

  it('save upserts the selected month and adds it to the options', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([]));
    const c = build();
    priv(c).scholarshipForm.get('invoice_number');
    (c as never as {scholarshipForm: {patchValue(v: Record<string, unknown>): void}})
      .scholarshipForm.patchValue({invoice_number: 'INV-8', scholarship_state: 'PA'});
    c.save();
    expect(scholarshipService.upsertScholarshipRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        contact_id: 'c-1',
        month: '2026-08',
        invoice_number: 'INV-8',
        scholarship_state: 'PA',
      }),
    );
    expect(priv(c).monthOptions).toContain('2026-08');
    expect(priv(c).savedSuccessfully).toBe(true);
    jest.advanceTimersByTime(3000);
    expect(priv(c).savedSuccessfully).toBe(false);
  });

  it('a saved month re-loads its values after switching away and back', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([record()]));
    const c = build();
    (c as never as {scholarshipForm: {patchValue(v: Record<string, unknown>): void}})
      .scholarshipForm.patchValue({invoice_number: 'INV-NEW'});
    c.save();
    c.onMonthChange('2026-07');
    c.onMonthChange('2026-08');
    expect(priv(c).scholarshipForm.value['invoice_number']).toBe('INV-NEW');
  });

  it('the dirty flag drives the unsaved hint: set by edits, cleared by save and month switch', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(of([]));
    const c = build();
    const form = (c as never as {
      scholarshipForm: {
        dirty: boolean;
        patchValue(v: Record<string, unknown>): void;
        markAsDirty(): void;
      };
    }).scholarshipForm;
    expect(form.dirty).toBe(false);
    // User edits (real inputs mark controls dirty; simulated here).
    form.patchValue({scholarship_state: 'PA'});
    form.markAsDirty();
    expect(form.dirty).toBe(true);
    // A successful save marks the form pristine — the hint clears.
    c.save();
    expect(form.dirty).toBe(false);
    // A month switch resets the form — no stale dirty flag.
    form.markAsDirty();
    c.onMonthChange('2026-07');
    expect(form.dirty).toBe(false);
  });

  it('a failed save flags the error and keeps the form', () => {
    scholarshipService.upsertScholarshipRecord.mockReturnValue(throwError(() => new Error('boom')));
    const c = build();
    c.save();
    expect(priv(c).hasError).toBe(true);
    expect(priv(c).saving).toBe(false);
  });

  it('blocks double-saves while in flight', () => {
    const c = build();
    priv(c).saving = true;
    c.save();
    expect(scholarshipService.upsertScholarshipRecord).not.toHaveBeenCalled();
  });

  it('formats month labels and swallows a failed load', () => {
    scholarshipService.getScholarshipRecordsByContact.mockReturnValue(throwError(() => new Error('x')));
    const c = build();
    expect(c.monthLabel('2026-08')).toBe('August 2026');
    expect(c.monthLabel('garbage')).toBe('garbage');
  });
});
