import {
  availableMakeupMinutes,
  bankMakeupMinutes,
  consumeMakeupMinutes,
  pruneExpiredBatches,
} from './makeup';
import {Student} from '../models/student.model';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-07-01T00:00:00.000Z');
const daysAgo = (n: number): string => new Date(NOW.getTime() - n * DAY).toISOString();

const student = (over: Partial<Student> = {}): Student =>
  ({id: 's-1', make_up_minutes: 0, ...over}) as Student;

describe('availableMakeupMinutes', () => {
  it('sums the unexpired batches', () => {
    const s = student({
      make_up_batches: [
        {minutes: 30, earned_date: daysAgo(10)},
        {minutes: 20, earned_date: daysAgo(89)},
      ],
    });
    expect(availableMakeupMinutes(s, NOW)).toBe(50);
  });

  it('excludes batches past the 90-day window', () => {
    const s = student({
      make_up_batches: [
        {minutes: 30, earned_date: daysAgo(10)},
        {minutes: 20, earned_date: daysAgo(91)},
      ],
    });
    expect(availableMakeupMinutes(s, NOW)).toBe(30);
  });

  it('treats exactly 90 days old as expired (89 kept, 91 gone)', () => {
    expect(
      availableMakeupMinutes(student({make_up_batches: [{minutes: 10, earned_date: daysAgo(89)}]}), NOW),
    ).toBe(10);
    expect(
      availableMakeupMinutes(student({make_up_batches: [{minutes: 10, earned_date: daysAgo(90)}]}), NOW),
    ).toBe(0);
    expect(
      availableMakeupMinutes(student({make_up_batches: [{minutes: 10, earned_date: daysAgo(91)}]}), NOW),
    ).toBe(0);
  });

  it('keeps every batch when the student is exempt', () => {
    const s = student({
      make_up_never_expire: true,
      make_up_batches: [{minutes: 20, earned_date: daysAgo(200)}],
    });
    expect(availableMakeupMinutes(s, NOW)).toBe(20);
  });

  it('falls back to the legacy scalar when there are no batches', () => {
    expect(availableMakeupMinutes(student({make_up_minutes: 45}), NOW)).toBe(45);
    expect(availableMakeupMinutes(student({make_up_batches: []}), NOW)).toBe(0);
  });
});

describe('bankMakeupMinutes', () => {
  it('appends a dated batch and refreshes the snapshot', () => {
    const s = bankMakeupMinutes(
      student({make_up_batches: [{minutes: 10, earned_date: daysAgo(5)}]}),
      20,
      daysAgo(0),
      NOW,
    );
    expect(s.make_up_batches).toHaveLength(2);
    expect(s.make_up_batches!.at(-1)).toEqual({minutes: 20, earned_date: daysAgo(0)});
    expect(s.make_up_minutes).toBe(30);
  });

  it('prunes expired batches when banking', () => {
    const s = bankMakeupMinutes(
      student({make_up_batches: [{minutes: 10, earned_date: daysAgo(91)}]}),
      20,
      daysAgo(0),
      NOW,
    );
    expect(s.make_up_batches).toHaveLength(1);
    expect(s.make_up_minutes).toBe(20);
  });

  it('folds a legacy scalar into a batch on first bank', () => {
    const s = bankMakeupMinutes(student({make_up_minutes: 15}), 20, daysAgo(0), NOW);
    expect(s.make_up_batches).toHaveLength(2); // legacy {15} + new {20}
    expect(s.make_up_minutes).toBe(35);
  });
});

describe('consumeMakeupMinutes', () => {
  it('draws oldest-first across batches (FIFO)', () => {
    const s = consumeMakeupMinutes(
      student({
        make_up_batches: [
          {minutes: 30, earned_date: daysAgo(50)},
          {minutes: 20, earned_date: daysAgo(10)},
        ],
      }),
      40,
      NOW,
    );
    // 30 (oldest) fully consumed, 10 taken from the newer batch → 10 left.
    expect(s.make_up_batches).toEqual([{minutes: 10, earned_date: daysAgo(10)}]);
    expect(s.make_up_minutes).toBe(10);
  });

  it('consumes only from live batches, dropping expired ones', () => {
    const s = consumeMakeupMinutes(
      student({
        make_up_batches: [
          {minutes: 30, earned_date: daysAgo(91)},
          {minutes: 20, earned_date: daysAgo(5)},
        ],
      }),
      5,
      NOW,
    );
    expect(s.make_up_batches).toEqual([{minutes: 15, earned_date: daysAgo(5)}]);
    expect(s.make_up_minutes).toBe(15);
  });

  it('folds a legacy scalar into a batch on first consume', () => {
    const s = consumeMakeupMinutes(student({make_up_minutes: 50}), 20, NOW);
    expect(s.make_up_minutes).toBe(30);
    expect(s.make_up_batches).toHaveLength(1);
  });

  it('leaves later batches untouched once the request is satisfied', () => {
    const s = consumeMakeupMinutes(
      student({
        make_up_batches: [
          {minutes: 10, earned_date: daysAgo(50)},
          {minutes: 15, earned_date: daysAgo(20)},
          {minutes: 20, earned_date: daysAgo(5)},
        ],
      }),
      10, // exactly the oldest batch → the other two are kept whole
      NOW,
    );
    expect(s.make_up_batches).toEqual([
      {minutes: 15, earned_date: daysAgo(20)},
      {minutes: 20, earned_date: daysAgo(5)},
    ]);
    expect(s.make_up_minutes).toBe(35);
  });
});

describe('pruneExpiredBatches', () => {
  it('drops expired batches and keeps unexpired ones', () => {
    const s = pruneExpiredBatches(
      student({
        make_up_batches: [
          {minutes: 10, earned_date: daysAgo(5)},
          {minutes: 20, earned_date: daysAgo(91)},
        ],
      }),
      NOW,
    );
    expect(s.make_up_batches).toEqual([{minutes: 10, earned_date: daysAgo(5)}]);
    expect(s.make_up_minutes).toBe(10);
  });

  it('keeps everything when the student is exempt', () => {
    const s = pruneExpiredBatches(
      student({make_up_never_expire: true, make_up_batches: [{minutes: 20, earned_date: daysAgo(200)}]}),
      NOW,
    );
    expect(s.make_up_minutes).toBe(20);
  });

  it('yields an empty ledger for a student with no minutes at all', () => {
    const s = pruneExpiredBatches(student({make_up_minutes: 0}), NOW);
    expect(s.make_up_batches).toEqual([]);
    expect(s.make_up_minutes).toBe(0);
  });

  it('defaults now to the current time when omitted', () => {
    // A batch earned right now is never expired regardless of the default clock.
    const s = pruneExpiredBatches(
      student({make_up_batches: [{minutes: 12, earned_date: new Date().toISOString()}]}),
    );
    expect(s.make_up_minutes).toBe(12);
  });
});
