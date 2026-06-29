import {inject, Injectable} from '@angular/core';
import {forkJoin, map, Observable, of, switchMap} from 'rxjs';
import {SessionsService} from './sessions.service';
import {StudentService} from './student.service';
import {Student} from '../models/student.model';
import {Session} from '../models/session.model';
import {Contact} from '../models/contact.model';
import {ScheduleSlot} from '../utils/proration';
import {Weekday, WEEKDAY_BY_JS_DAY, WEEKDAY_LABELS} from '../enums/weekday.enum';
import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';
import {PackageDef, resolvePackageDef} from '../utils/package-config';

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

  /** A copy of `date` with its time set from a 'HH:mm' string. */
  atTime(date: Date, time: string): Date {
    const total = this.timeStringToMinutes(time);
    const d = new Date(date);
    d.setHours(Math.floor(total / 60), total % 60, 0, 0);
    return d;
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
  resolveDef(student: Student): PackageDef | null {
    return resolvePackageDef(student.package, {
      monthlyCost: student.custom_monthly_cost,
      sessionsPerWeek: student.custom_sessions_per_week,
      sessionLengthMin: student.custom_session_length_min,
    });
  }

  /** A read-only summary of a schedule, e.g. ['Mon 10:00 AM', 'Wed 10:00 AM']. */
  scheduleSummary(schedule: ScheduleSlot[] | undefined): string[] {
    return (schedule ?? []).map(
      slot => `${WEEKDAY_LABELS[slot.weekday]} ${this.formatTime12(slot.start_time)}`,
    );
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
  /** Builds the PENDING tutoring sessions for a set of occurrences, tagged with `seriesId`. */
  buildSessions(
    student: Student,
    tutor: Contact,
    occurrences: ScheduleOccurrence[],
    seriesId: string,
    notes: string = '',
  ): Session[] {
    return occurrences.map(({date, slot}) => {
      const s = new Session();
      s.type = SessionType.TUTORING;
      s.tutor_id = tutor.id;
      s.tutor_name = tutor.first_name;
      s.student_id = student.id;
      s.student_name = student.name;
      s.start_datetime = this.atTime(date, slot.start_time).toISOString();
      s.end_datetime = this.atTime(date, slot.end_time).toISOString();
      s.status = SessionStatus.PENDING;
      s.notes = notes;
      s.series_id = seriesId;
      return s;
    });
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

  /** The series id of the soonest future-pending session, or null if there are none. */
  private activeSeriesId(futurePending: Session[]): string | null {
    const soonest = [...futurePending].sort(
      (a, b) => new Date(a.start_datetime!).getTime() - new Date(b.start_datetime!).getTime(),
    )[0];
    return soonest?.series_id ?? null;
  }

  private dateOnlyIso(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).toISOString();
  }

  // ── orchestration ───────────────────────────────────────────────────────────
  /**
   * Creates a brand-new schedule: generates this month's sessions from `startDate`
   * and persists the template (schedule + package_start_date + auto_renew) on the
   * student. Resolves with the updated student.
   */
  createSchedule(
    student: Student,
    tutor: Contact,
    slots: ScheduleSlot[],
    startDate: Date,
    autoRenew: boolean,
  ): Observable<Student> {
    const seriesId = crypto.randomUUID();
    const occurrences = this.buildOccurrences(slots, startDate);
    const sessions = this.buildSessions(student, tutor, occurrences, seriesId);
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
      map(() => updated),
    );
  }

  /**
   * Edits an existing schedule: deletes this month's future-pending series
   * sessions, regenerates the remainder of the month from the new slots (reusing
   * the active series id when one exists), and saves the new template. The
   * original package_start_date is preserved. Resolves with the updated student.
   */
  updateSchedule(
    student: Student,
    tutor: Contact,
    slots: ScheduleSlot[],
    autoRenew: boolean,
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
        const seriesId = this.activeSeriesId(futurePending) ?? crypto.randomUUID();
        const sessions = this.buildSessions(student, tutor, this.buildOccurrences(slots, now), seriesId)
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
          map(() => updated),
        );
      }),
    );
  }

  /**
   * Deletes a schedule: removes this month's future-pending series sessions, then
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
