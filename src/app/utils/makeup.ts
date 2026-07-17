import {MakeupBatch, Student} from '../models/student.model';

/** Make-up minutes expire this many days after they're earned (unless overridden). */
export const MAKEUP_EXPIRY_DAYS = 90;

const DAY_MS = 24 * 60 * 60 * 1000;

/** True when a batch is past its 90-day life (never, if the student is exempt). */
function isExpired(batch: MakeupBatch, student: Student, now: Date): boolean {
  if (student.make_up_never_expire) {
    return false;
  }
  const cutoff = now.getTime() - MAKEUP_EXPIRY_DAYS * DAY_MS;
  return new Date(batch.earned_date).getTime() <= cutoff;
}

/**
 * A legacy student (pre-ledger) has only the `make_up_minutes` scalar. On the
 * first ledger write, fold that balance into a single batch dated now so it
 * isn't lost once batches exist (the balance is derived from batches alone).
 */
function ensureBatches(student: Student, now: Date): MakeupBatch[] {
  if (student.make_up_batches && student.make_up_batches.length > 0) {
    return student.make_up_batches.map(b => ({...b}));
  }
  const legacy = student.make_up_minutes ?? 0;
  return legacy > 0 ? [{minutes: legacy, earned_date: now.toISOString()}] : [];
}

/** Writes the batch list onto the student and refreshes the denormalized snapshot. */
function apply(student: Student, batches: MakeupBatch[]): Student {
  student.make_up_batches = batches;
  student.make_up_minutes = batches.reduce((sum, b) => sum + b.minutes, 0);
  return student;
}

/**
 * The student's currently-available make-up minutes: the sum of unexpired
 * batches, or (for a legacy record with no batches yet) the raw scalar.
 */
export function availableMakeupMinutes(student: Student, now: Date = new Date()): number {
  const batches = student.make_up_batches;
  if (!batches || batches.length === 0) {
    return student.make_up_minutes ?? 0;
  }
  return batches
    .filter(b => !isExpired(b, student, now))
    .reduce((sum, b) => sum + b.minutes, 0);
}

/** Drops expired batches (and refreshes the snapshot). */
export function pruneExpiredBatches(student: Student, now: Date = new Date()): Student {
  const batches = ensureBatches(student, now).filter(b => !isExpired(b, student, now));
  return apply(student, batches);
}

/** Banks `minutes` as a new dated batch, pruning any that have since expired. */
export function bankMakeupMinutes(
  student: Student,
  minutes: number,
  earnedDateIso: string,
  now: Date = new Date(),
): Student {
  const batches = ensureBatches(student, now).filter(b => !isExpired(b, student, now));
  batches.push({minutes, earned_date: earnedDateIso});
  return apply(student, batches);
}

/**
 * Consumes `minutes` from the unexpired batches, oldest first (FIFO), so the
 * minutes closest to expiring are used up first. Expired batches are dropped.
 */
export function consumeMakeupMinutes(
  student: Student,
  minutes: number,
  now: Date = new Date(),
): Student {
  const live = ensureBatches(student, now)
    .filter(b => !isExpired(b, student, now))
    .sort((a, b) => new Date(a.earned_date).getTime() - new Date(b.earned_date).getTime());

  let remaining = minutes;
  const kept: MakeupBatch[] = [];
  for (const batch of live) {
    if (remaining <= 0) {
      kept.push(batch);
    } else if (batch.minutes <= remaining) {
      remaining -= batch.minutes; // whole batch consumed → dropped
    } else {
      kept.push({...batch, minutes: batch.minutes - remaining});
      remaining = 0;
    }
  }
  return apply(student, kept);
}
