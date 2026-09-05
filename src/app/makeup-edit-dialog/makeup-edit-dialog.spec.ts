import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MakeupEditDialog } from './makeup-edit-dialog';
import { StudentService } from '../services/student.service';
import { Student } from '../models/student.model';

describe('MakeupEditDialog', () => {
  const dialogRef = { close: jest.fn() };
  const studentService = { updateStudent: jest.fn() };

  const build = (student: Partial<Student>): MakeupEditDialog => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [MakeupEditDialog],
      providers: [
        { provide: MAT_DIALOG_DATA, useValue: { student: { id: 's-1', contact_id: 'c-1', name: 'Pat', ...student } } },
        { provide: MatDialogRef, useValue: dialogRef },
        { provide: StudentService, useValue: studentService },
      ],
    });
    return TestBed.createComponent(MakeupEditDialog).componentInstance;
  };

  const rows = (c: MakeupEditDialog) =>
    (c as unknown as { rows: {minutes: number; earned_date: string | null; removed: boolean; added: boolean; legacy: boolean}[] }).rows;
  const saved = () => studentService.updateStudent.mock.calls.at(-1)![0] as Student;

  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-08-20T15:00:00Z'));
    studentService.updateStudent.mockReturnValue(of({}));
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.useRealTimers());

  it('seeds rows from the batch ledger', () => {
    const c = build({ make_up_batches: [
      { minutes: 30, earned_date: '2026-08-01T10:00:00Z' },
      { minutes: 45, earned_date: '2026-08-10T10:00:00Z' },
    ]});
    expect(rows(c).map(r => r.minutes)).toEqual([30, 45]);
    expect(c.projectedTotal).toBe(75);
  });

  it('seeds a legacy scalar as a single no-expiry-data row', () => {
    const c = build({ make_up_minutes: 110 });
    expect(rows(c)).toHaveLength(1);
    expect(rows(c)[0].legacy).toBe(true);
    expect(rows(c)[0].earned_date).toBeNull();
  });

  it('untouched buckets keep their earned dates on save', () => {
    const c = build({ make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }] });
    c.save();
    expect(saved().make_up_batches).toEqual([{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }]);
    expect(saved().make_up_minutes).toBe(30);
    expect(dialogRef.close).toHaveBeenCalledWith({
      make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }],
      make_up_minutes: 30,
    });
  });

  it('an edited bucket restarts its 90-day clock from today', () => {
    const c = build({ make_up_batches: [
      { minutes: 30, earned_date: '2026-08-01T10:00:00Z' },
      { minutes: 45, earned_date: '2026-08-10T10:00:00Z' },
    ]});
    rows(c)[0].minutes = 60;
    c.save();
    expect(saved().make_up_batches).toEqual([
      { minutes: 60, earned_date: '2026-08-20T15:00:00.000Z' }, // reset
      { minutes: 45, earned_date: '2026-08-10T10:00:00Z' },     // untouched
    ]);
    expect(saved().make_up_minutes).toBe(105);
  });

  it('never-expire students keep provenance dates even on edits', () => {
    const c = build({
      make_up_never_expire: true,
      make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }],
    });
    rows(c)[0].minutes = 90;
    c.save();
    expect(saved().make_up_batches).toEqual([{ minutes: 90, earned_date: '2026-08-01T10:00:00Z' }]);
  });

  it('added buckets are dated today; the add control guards non-positives', () => {
    const c = build({});
    (c as unknown as { addMinutes: number }).addMinutes = 0;
    c.addRow();
    expect(rows(c)).toHaveLength(0);
    (c as unknown as { addMinutes: number }).addMinutes = 45;
    c.addRow();
    expect(rows(c)).toHaveLength(1);
    c.save();
    expect(saved().make_up_batches).toEqual([{ minutes: 45, earned_date: '2026-08-20T15:00:00.000Z' }]);
  });

  it('removed buckets are dropped (and can be un-removed before saving)', () => {
    const c = build({ make_up_batches: [
      { minutes: 30, earned_date: '2026-08-01T10:00:00Z' },
      { minutes: 45, earned_date: '2026-08-10T10:00:00Z' },
    ]});
    c.toggleRemoved(rows(c)[0]);
    expect(c.projectedTotal).toBe(45);
    c.toggleRemoved(rows(c)[0]);
    expect(c.projectedTotal).toBe(75);
    c.toggleRemoved(rows(c)[1]);
    c.save();
    expect(saved().make_up_batches).toEqual([{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }]);
    expect(saved().make_up_minutes).toBe(30);
  });

  it('a legacy balance converts to a dated bucket on save', () => {
    const c = build({ make_up_minutes: 110 });
    c.save();
    expect(saved().make_up_batches).toEqual([{ minutes: 110, earned_date: '2026-08-20T15:00:00.000Z' }]);
    expect(saved().make_up_minutes).toBe(110);
  });

  it('refuses to save while a kept bucket has non-positive minutes', () => {
    const c = build({ make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }] });
    rows(c)[0].minutes = 0;
    expect(c.valid).toBe(false);
    c.save();
    expect(studentService.updateStudent).not.toHaveBeenCalled();
    // Removing the bad row makes it saveable again.
    c.toggleRemoved(rows(c)[0]);
    expect(c.valid).toBe(true);
  });

  it('a failed save keeps the dialog open with an error', () => {
    studentService.updateStudent.mockReturnValue(throwError(() => new Error('x')));
    const c = build({ make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00Z' }] });
    c.save();
    expect((c as unknown as { hasError: boolean }).hasError).toBe(true);
    expect((c as unknown as { submitting: boolean }).submitting).toBe(false);
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('Save commits an uncommitted "Add minutes" value instead of dropping it (client regression)', () => {
    // Adam Miksa: 270 typed into the add box, Save clicked without Add ->
    // the ledger was written EMPTY. Now Save adds the row first.
    const c = build({});
    (c as unknown as { addMinutes: number }).addMinutes = 270;
    expect(c.projectedTotal).toBe(270); // the preview already counts it
    c.save();
    const payload = saved();
    expect(payload.make_up_minutes).toBe(270);
    expect(payload.make_up_batches).toEqual([
      { minutes: 270, earned_date: '2026-08-20T15:00:00.000Z' },
    ]);
    expect(dialogRef.close).toHaveBeenCalledWith({
      make_up_batches: [{ minutes: 270, earned_date: '2026-08-20T15:00:00.000Z' }],
      make_up_minutes: 270,
    });
  });

  it('an empty or non-positive add box adds nothing on Save', () => {
    const c = build({ make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T00:00:00.000Z' }] });
    (c as unknown as { addMinutes: number | null }).addMinutes = null;
    expect(c.pendingAddMinutes).toBe(0);
    (c as unknown as { addMinutes: number }).addMinutes = -5;
    expect(c.pendingAddMinutes).toBe(0);
    c.save();
    expect(saved().make_up_batches).toHaveLength(1);
    expect(saved().make_up_minutes).toBe(30);
  });

  it('cancel closes with null', () => {
    const c = build({});
    c.cancel();
    expect(dialogRef.close).toHaveBeenCalledWith(null);
  });

  it('expiryOf: date for untouched rows, null for never-expire/dirty/legacy', () => {
    const c = build({ make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00.000Z' }] });
    expect(c.expiryOf(rows(c)[0])?.toISOString()).toBe('2026-10-30T10:00:00.000Z'); // +90d
    rows(c)[0].minutes = 60; // dirty -> clock will reset, no fixed date to show
    expect(c.expiryOf(rows(c)[0])).toBeNull();

    const legacy = build({ make_up_minutes: 50 });
    expect(legacy.expiryOf(rows(legacy)[0])).toBeNull();

    const never = build({ make_up_never_expire: true, make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00.000Z' }] });
    expect(never.expiryOf(rows(never)[0])).toBeNull();
  });

  it('addRow treats a null input as zero (no row added)', () => {
    const c = build({});
    (c as unknown as { addMinutes: number | null }).addMinutes = null;
    c.addRow();
    expect(rows(c)).toHaveLength(0);
  });

  it('save and cancel are inert while a save is in flight', () => {
    const c = build({ make_up_batches: [{ minutes: 30, earned_date: '2026-08-01T10:00:00.000Z' }] });
    (c as unknown as { submitting: boolean }).submitting = true;
    c.save();
    c.cancel();
    expect(studentService.updateStudent).not.toHaveBeenCalled();
    expect(dialogRef.close).not.toHaveBeenCalled();
  });

  it('negative minutes never count toward the projected total', () => {
    const c = build({ make_up_batches: [
      { minutes: 30, earned_date: '2026-08-01T10:00:00.000Z' },
      { minutes: 45, earned_date: '2026-08-10T10:00:00.000Z' },
    ]});
    rows(c)[0].minutes = -10;
    expect(c.projectedTotal).toBe(45);
    expect(c.valid).toBe(false);
  });
});
