import {
  availableMakeupMinutes,
  bankMakeupMinutes,
  consumeMakeupMinutes,
  pruneExpiredBatches,
  serviceEndInstant,
  unexpiredBatchViews,
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

describe('ensureBatches via pruneExpiredBatches (legacy edge cases)', () => {
  it('produces no batches for a zero or absent legacy balance', () => {
    expect(pruneExpiredBatches({ make_up_minutes: 0 } as never).make_up_batches).toEqual([]);
    expect(pruneExpiredBatches({} as never).make_up_batches).toEqual([]);
  });
});

describe('unexpiredBatchViews', () => {
  const now = new Date('2026-08-03T12:00:00Z');

  it('drops expired batches and computes each expiry, oldest first', () => {
    const views = unexpiredBatchViews(
      {
        make_up_batches: [
          { minutes: 30, earned_date: '2026-07-01T14:00:00.000Z' },
          { minutes: 15, earned_date: '2026-04-01T14:00:00.000Z' }, // expired
          { minutes: 45, earned_date: '2026-06-01T14:00:00.000Z' },
        ],
      } as never,
      now,
    );
    expect(views.map(v => v.minutes)).toEqual([45, 30]);
    expect(views[0].expires!.toISOString()).toBe('2026-08-30T14:00:00.000Z');
  });

  it('returns null expiries for a never-expire student', () => {
    const views = unexpiredBatchViews(
      {
        make_up_never_expire: true,
        make_up_batches: [{ minutes: 30, earned_date: '2025-01-01T00:00:00.000Z' }],
      } as never,
      now,
    );
    expect(views).toHaveLength(1);
    expect(views[0].expires).toBeNull();
  });

  it('defaults `now` to the current time', () => {
    const views = unexpiredBatchViews({
      make_up_batches: [{ minutes: 30, earned_date: new Date().toISOString() }],
    } as never);
    expect(views).toHaveLength(1);
  });

  it('returns an empty list for batch-less (legacy) students', () => {
    expect(unexpiredBatchViews({ make_up_minutes: 60 } as never, now)).toEqual([]);
  });
});

describe('service end date', () => {
  // Local wall times: the end date is the student's last day, through 23:59:59.
  const lastDay = new Date(2026, 6, 10, 23, 59, 59, 999);
  const during = new Date(2026, 6, 10, 18, 0, 0);
  const after = new Date(2026, 6, 11, 0, 0, 0);
  const fresh = (now: Date) => new Date(now.getTime() - 5 * DAY).toISOString();

  it('serviceEndInstant is the end of the last day', () => {
    expect(serviceEndInstant(student({service_end_date: '2026-07-10'}))).toEqual(lastDay);
    expect(serviceEndInstant(student({service_end_date: '2026-07-10T00:00:00'}))).toEqual(lastDay);
    expect(serviceEndInstant(student())).toBeNull();
    expect(serviceEndInstant(student({service_end_date: null}))).toBeNull();
    expect(serviceEndInstant(student({service_end_date: 'soon'}))).toBeNull();
  });

  it('minutes stay available through the last day', () => {
    const s = student({
      service_end_date: '2026-07-10',
      make_up_batches: [{minutes: 45, earned_date: fresh(during)}],
    });
    expect(availableMakeupMinutes(s, during)).toBe(45);
    expect(availableMakeupMinutes(s, lastDay)).toBe(45);
  });

  it('every minute expires once service has ended, exempt or not', () => {
    const s = student({
      service_end_date: '2026-07-10',
      make_up_batches: [{minutes: 45, earned_date: fresh(after)}],
    });
    expect(availableMakeupMinutes(s, after)).toBe(0);
    expect(availableMakeupMinutes({...s, make_up_never_expire: true}, after)).toBe(0);
    expect(pruneExpiredBatches({...s}, after).make_up_batches).toEqual([]);
    expect(unexpiredBatchViews(s, after)).toEqual([]);
  });

  it('a legacy scalar balance expires too', () => {
    const s = student({service_end_date: '2026-07-10', make_up_minutes: 60});
    expect(availableMakeupMinutes(s, during)).toBe(60);
    expect(availableMakeupMinutes(s, after)).toBe(0);
  });

  it('caps the displayed expiry at the end of service', () => {
    const earned = fresh(during);
    const natural = new Date(new Date(earned).getTime() + 90 * DAY);
    const views = (over: Partial<Student>) =>
      unexpiredBatchViews(student({make_up_batches: [{minutes: 30, earned_date: earned}], ...over}), during);
    expect(views({service_end_date: '2026-07-10'})[0].expires).toEqual(lastDay);
    // An end date later than the natural expiry changes nothing.
    expect(views({service_end_date: '2027-01-01'})[0].expires).toEqual(natural);
    expect(views({})[0].expires).toEqual(natural);
    // Exempt minutes still end with service, and never expire without an end date.
    expect(views({make_up_never_expire: true, service_end_date: '2026-07-10'})[0].expires).toEqual(lastDay);
    expect(views({make_up_never_expire: true})[0].expires).toBeNull();
  });
});
