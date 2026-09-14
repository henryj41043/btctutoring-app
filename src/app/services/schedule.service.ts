import {inject, Injectable} from '@angular/core';
import {catchError, forkJoin, map, Observable, of, switchMap} from 'rxjs';
import {SessionsService} from './sessions.service';
import {StudentService} from './student.service';
import {Student} from '../models/student.model';
import {Session} from '../models/session.model';
import {Contact} from '../models/contact.model';
import {ScheduleSlot} from '../utils/proration';
import {easternSlotToUtc} from '../utils/eastern-time';
import {Weekday, WEEKDAY_BY_JS_DAY, WEEKDAY_LABELS} from '../enums/weekday.enum';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {PackageDef, PackageCatalog, resolvePackageDef} from '../utils/package-config';
import {studentDisplayName} from '../utils/student-name';
import {effectiveSlotTutorId, groupSlotsByEffectiveTutor} from '../utils/slot-tutor';

/** One generated occurrence of a weekly slot on a concrete calendar date. */
export interface ScheduleOccurrence {
  date: Date;
  slot: ScheduleSlot;
}

/**
 * Owns all monthly-schedule logic: occurrence generation, tutor-availability
 * checks, session building, and the create/edit/delete orchestration that the
 * Manage Schedule dialog drives. Kept UI-free — availability *failures* are
 * returned for the caller to surface (warn/override), the service never decides
 * UX. Extracted out of `session-dialog` so it can be shared and unit-tested.
 */
@Injectable({providedIn: 'root'})
export class ScheduleService {
  private sessionsService: SessionsService = inject(SessionsService);
  private studentService: StudentService = inject(StudentService);

  // ── pure time helpers ──────────────────────────────────────────────────────
  timeStringToMinutes(time: string): number {
    const [h, m] = (time ?? '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /** Adds minutes to a 'HH:mm' string, returning a 'HH:mm' string. */
  addMinutesToTime(time: string, minutes: number): string {
    const total = this.timeStringToMinutes(time) + minutes;
    const h = Math.floor(total / 60) % 24;
    const m = total % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  /** The instant at which `date`'s calendar day reads `time` on an EASTERN wall
   *  clock. Slot times are Eastern by definition; pinning the zone keeps the
   *  generated instants identical to the backend cron's regardless of the
   *  admin's machine timezone (mirrors the service-side eastern-time util). */
  atTime(date: Date, time: string): Date {
    return easternSlotToUtc(date.getFullYear(), date.getMonth(), date.getDate(), time);
  }

  /** A human '10:00 AM' label for a 'HH:mm' string. */
  formatTime12(time: string): string {
    const total = this.timeStringToMinutes(time);
    const h24 = Math.floor(total / 60);
    const m = total % 60;
    const period = h24 < 12 ? 'AM' : 'PM';
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
  }

  // ── package + slots ─────────────────────────────────────────────────────────
  /** The resolved package definition for a student (null if CUSTOM is unconfigured). */
  resolveDef(student: Student, catalog: PackageCatalog): PackageDef | null {
    return resolvePackageDef(student.package, catalog, {
      monthlyCost: student.custom_monthly_cost,
      sessionsPerWeek: student.custom_sessions_per_week,
      sessionLengthMin: student.custom_session_length_min,
    });
  }

  /**
   * A read-only summary of a schedule, e.g. ['Mon 10:00 AM', 'Wed 4:00 PM (Maria)'].
   * A slot overriding the primary tutor gets the tutor's first name appended
   * when the caller supplies a resolver (suffix omitted while unresolvable).
   */
  scheduleSummary(
    schedule: ScheduleSlot[] | undefined,
    primaryTutorId?: string,
    tutorNameById?: (id: string) => string | undefined,
  ): string[] {
    return (schedule ?? []).map(slot => {
      const base = `${WEEKDAY_LABELS[slot.weekday]} ${this.formatTime12(slot.start_time)}`;
      if (slot.tutor_id && slot.tutor_id !== primaryTutorId) {
        const name = tutorNameById?.(slot.tutor_id);
        if (name) {
          return `${base} (${name})`;
        }
      }
      return base;
    });
  }

  // ── occurrence generation ───────────────────────────────────────────────────
  /** Every date from `start` (inclusive) through the end of start's month that lands on `weekday`. */
  generateMonthOccurrences(start: Date, weekday: Weekday): Date[] {
    const result: Date[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const endOfMonth = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    while (cursor <= endOfMonth) {
      if (WEEKDAY_BY_JS_DAY[cursor.getDay()] === weekday) {
        result.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  /** All occurrences for every slot from `start` through the end of start's month. */
  buildOccurrences(slots: ScheduleSlot[], start: Date): ScheduleOccurrence[] {
    const occurrences: ScheduleOccurrence[] = [];
    for (const slot of slots) {
      for (const date of this.generateMonthOccurrences(start, slot.weekday)) {
        occurrences.push({date, slot});
      }
    }
    return occurrences;
  }

  // ── availability ────────────────────────────────────────────────────────────
  /** True if the tutor has no availability set (skip) or the range fits within a block. */
  isDateTimeWithinAvailability(
    tutor: Contact | undefined,
    date: Date,
    startMin: number,
    endMin: number,
  ): boolean {
    if (!tutor || !tutor.availability || tutor.availability.length === 0) return true;
    const weekday = WEEKDAY_BY_JS_DAY[date.getDay()];
    return tutor.availability.some(
      block =>
        block.days.includes(weekday) &&
        this.timeStringToMinutes(block.start_time) <= startMin &&
        this.timeStringToMinutes(block.end_time) >= endMin,
    );
  }

  /** The occurrences that fall outside the tutor's availability (empty when all fit). */
  findAvailabilityFailures(
    tutor: Contact | undefined,
    occurrences: ScheduleOccurrence[],
  ): ScheduleOccurrence[] {
    return occurrences.filter(
      o =>
        !this.isDateTimeWithinAvailability(
          tutor,
          o.date,
          this.timeStringToMinutes(o.slot.start_time),
          this.timeStringToMinutes(o.slot.end_time),
        ),
    );
  }

  // ── session building ────────────────────────────────────────────────────────
  /**
   * Builds the PENDING tutoring sessions for a set of occurrences. Each
   * occurrence belongs to its slot's EFFECTIVE tutor (per-slot override or the
   * primary) and carries that tutor's series id from `seriesIdByTutor` —
   * series-scoped edits must never touch another tutor's sessions.
   */
  buildSessions(
    student: Student,
    tutor: Contact,
    occurrences: ScheduleOccurrence[],
    seriesIdByTutor: Map<string, string>,
    tutorsById: Map<string, Contact> = new Map(),
    notes: string = '',
  ): Session[] {
    return occurrences.map(({date, slot}) => {
      const effTutorId = effectiveSlotTutorId(slot, {...student, assigned_tutor_id: tutor.id}) ?? tutor.id;
      const effTutor = effTutorId === tutor.id ? tutor : tutorsById.get(effTutorId!);
      const s = new Session();
      s.type = SessionType.TUTORING;
      s.tutor_id = effTutorId;
      s.tutor_name = effTutor?.first_name ?? '';
      s.student_id = student.id;
      s.student_name = studentDisplayName(student);
      s.start_datetime = this.atTime(date, slot.start_time).toISOString();
      s.end_datetime = this.atTime(date, slot.end_time).toISOString();
      s.status = SessionStatus.PENDING;
      s.notes = notes;
      s.series_id = seriesIdByTutor.get(effTutorId ?? '');
      return s;
    });
  }

  /** A time window over session start instants: `from` inclusive, `to` exclusive. */
  private inWindow(session: Session, window?: {from: Date; to?: Date}): boolean {
    if (!window) return true;
    const start = new Date(session.start_datetime!);
    return start >= window.from && (!window.to || start < window.to);
  }

  /**
   * A student's future (after now) PENDING tutoring sessions — series or not —
   * optionally limited to a window. Make-ups, trials and group sessions are
   * never included.
   */
  futurePendingTutoring(
    studentId: string,
    now: Date = new Date(),
    window?: {from: Date; to?: Date},
  ): Observable<Session[]> {
    return this.sessionsService.getSessionsByStudent(studentId).pipe(
      map(sessions =>
        sessions.filter(
          s =>
            s.type === SessionType.TUTORING &&
            s.status === SessionStatus.PENDING &&
            !!s.start_datetime &&
            new Date(s.start_datetime) > now &&
            this.inWindow(s, window),
        ),
      ),
    );
  }

  /**
   * Deletes a student's future PENDING tutoring sessions (see
   * futurePendingTutoring) and resolves with the count removed. Deleting banks
   * no make-up minutes — callers warn the admin to cancel first when the
   * minutes should be kept.
   */
  deleteFuturePendingSessions(
    studentId: string,
    now: Date = new Date(),
    window?: {from: Date; to?: Date},
  ): Observable<number> {
    return this.futurePendingTutoring(studentId, now, window).pipe(
      switchMap(targets =>
        targets.length
          ? forkJoin(targets.map(s => this.sessionsService.deleteSession(s.id!))).pipe(map(() => targets.length))
          : of(0),
      ),
    );
  }

  /**
   * After a schedule save: have the service generate the next three months for
   * this student (idempotent). Best effort — a failure here never fails the
   * save, since the nightly horizon job fills the same months. Nothing is
   * generated ahead when auto-renew is off.
   */
  fillAhead(student: Student): Observable<unknown> {
    if (!student.auto_renew || !student.id) {
      return of(null);
    }
    return this.sessionsService.fillHorizon(student.id).pipe(catchError(() => of(null)));
  }

  /** A student's future (after now) PENDING tutoring sessions that belong to a series. */
  private futurePendingSeries(sessions: Session[], now: Date): Session[] {
    return sessions.filter(
      s =>
        s.type === SessionType.TUTORING &&
        s.status === SessionStatus.PENDING &&
        !!s.series_id &&
        !!s.start_datetime &&
        new Date(s.start_datetime) > now,
    );
  }

  /**
   * The soonest future-pending series id PER TUTOR — the reuse candidates for
   * regeneration. On legacy single-tutor data this reuses the exact id the old
   * single-series logic chose.
   */
  private activeSeriesIdByTutor(futurePending: Session[]): Map<string, string> {
    const sorted = [...futurePending].sort(
      (a, b) => new Date(a.start_datetime!).getTime() - new Date(b.start_datetime!).getTime(),
    );
    const byTutor = new Map<string, string>();
    for (const session of sorted) {
      if (session.tutor_id && session.series_id && !byTutor.has(session.tutor_id)) {
        byTutor.set(session.tutor_id, session.series_id);
      }
    }
    return byTutor;
  }

  /** One series id per effective tutor: reuse when recoverable, else mint. */
  private seriesIdsFor(
    slots: ScheduleSlot[],
    student: Student,
    reusable: Map<string, string> = new Map(),
  ): Map<string, string> {
    const ids = new Map<string, string>();
    for (const tutorId of groupSlotsByEffectiveTutor(slots, student).keys()) {
      ids.set(tutorId, reusable.get(tutorId) ?? crypto.randomUUID());
    }
    return ids;
  }

  private dateOnlyIso(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  }

  // ── orchestration ───────────────────────────────────────────────────────────
  /**
   * Creates a brand-new schedule: generates this month's sessions from `startDate`
   * and persists the template (schedule + package_start_date + auto_renew) on the
   * student, then asks the service to fill the next three months (auto-renew
   * only). Resolves with the updated student.
   */
  createSchedule(
    student: Student,
    tutor: Contact,
    slots: ScheduleSlot[],
    startDate: Date,
    autoRenew: boolean,
    tutorsById: Map<string, Contact> = new Map(),
  ): Observable<Student> {
    const withPrimary: Student = {...student, assigned_tutor_id: tutor.id};
    const seriesIds = this.seriesIdsFor(slots, withPrimary);
    const occurrences = this.buildOccurrences(slots, startDate);
    const sessions = this.buildSessions(student, tutor, occurrences, seriesIds, tutorsById);
    const updated: Student = {
      ...student,
      assigned_tutor_id: tutor.id,
      schedule: slots,
      package_start_date: this.dateOnlyIso(startDate),
      auto_renew: autoRenew,
    };
    const create$: Observable<unknown> = sessions.length
      ? this.sessionsService.createSessions(sessions)
      : of(null);
    return create$.pipe(
      switchMap(() => this.studentService.updateStudent(updated)),
      switchMap(() => this.fillAhead(updated)),
      map(() => updated),
    );
  }

  /**
   * Edits an existing schedule: deletes ALL future-pending series sessions
   * (including months generated ahead), regenerates the remainder of this month
   * from the new slots (reusing the active series id when one exists), saves the
   * new template, then asks the service to refill the months ahead (auto-renew
   * only — turning it off therefore also drops the future months). The original
   * package_start_date is preserved. Resolves with the updated student.
   */
  updateSchedule(
    student: Student,
    tutor: Contact,
    slots: ScheduleSlot[],
    autoRenew: boolean,
    tutorsById: Map<string, Contact> = new Map(),
  ): Observable<Student> {
    const now = new Date();
    const updated: Student = {
      ...student,
      assigned_tutor_id: tutor.id,
      schedule: slots,
      auto_renew: autoRenew,
    };
    return this.sessionsService.getSessionsByStudent(student.id!).pipe(
      switchMap(existing => {
        const futurePending = this.futurePendingSeries(existing, now);
        const seriesIds = this.seriesIdsFor(
          slots, updated, this.activeSeriesIdByTutor(futurePending));
        const sessions = this.buildSessions(student, tutor, this.buildOccurrences(slots, now), seriesIds, tutorsById)
          .filter(s => new Date(s.start_datetime!) > now);
        const deletes$: Observable<unknown> = futurePending.length
          ? forkJoin(futurePending.map(s => this.sessionsService.deleteSession(s.id!)))
          : of([]);
        const create$: Observable<unknown> = sessions.length
          ? this.sessionsService.createSessions(sessions)
          : of(null);
        return deletes$.pipe(
          switchMap(() => create$),
          switchMap(() => this.studentService.updateStudent(updated)),
          switchMap(() => this.fillAhead(updated)),
          map(() => updated),
        );
      }),
    );
  }

  /**
   * Deletes a schedule: removes every future-pending series session, then
   * clears the template (empty schedule signals the backend to drop it) and turns
   * auto-renew off. History (past/finalized sessions) is preserved.
   */
  deleteSchedule(student: Student): Observable<Student> {
    const now = new Date();
    const cleared: Student = {...student, schedule: [], auto_renew: false};
    return this.sessionsService.getSessionsByStudent(student.id!).pipe(
      switchMap(existing => {
        const futurePending = this.futurePendingSeries(existing, now);
        const deletes$: Observable<unknown> = futurePending.length
          ? forkJoin(futurePending.map(s => this.sessionsService.deleteSession(s.id!)))
          : of([]);
        return deletes$.pipe(
          switchMap(() => this.studentService.updateStudent(cleared)),
          map(() => cleared),
        );
      }),
    );
  }
}
