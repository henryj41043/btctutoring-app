import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  inject,
  Input,
  OnChanges,
} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {FormsModule} from '@angular/forms';
import {HttpErrorResponse} from '@angular/common/http';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {MatInputModule} from '@angular/material/input';
import {MatCheckboxModule} from '@angular/material/checkbox';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {catchError, EMPTY, Observable, of, Subject, switchMap, tap} from 'rxjs';
import {SessionsService} from '../services/sessions.service';
import {Session} from '../models/session.model';
import {Student} from '../models/student.model';
import {MakeupCandidate, MakeupSetRequest, MakeupSetResult} from '../models/makeup-set.model';
import {durationMinutes} from '../utils/session-times';
import {
  afterSessionOccurrences,
  repeatUntilBounds,
  REPEAT_WEEKDAYS,
  skipReasonText,
  weeklyOccurrences,
} from '../utils/makeup-repeat';

export type RepeatMode = 'once' | 'weekly' | 'after';

/** One line of the preview: a proposed make-up and whether the minutes cover it. */
export interface PreviewRow {
  start: string;
  end: string;
  /** Empty when it fits; otherwise why it was left out. */
  skipped: string;
}

/**
 * The "Repeat" part of the make-up form: just this once (the parent's own
 * single create), weekly on chosen weekdays, or straight after each regular
 * session. It proposes the dates; the service says which of them the
 * student's minutes cover (a dry run), and that preview is what Save creates.
 */
@Component({
  selector: 'app-makeup-repeat',
  imports: [
    DatePipe,
    FormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './makeup-repeat.html',
  styleUrl: './makeup-repeat.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MakeupRepeat implements OnChanges {
  @Input() student: Student | undefined;
  @Input() tutorId: string | undefined;
  @Input() tutorName: string | undefined;
  @Input() date: Date | undefined;
  @Input() startTime: Date | undefined;
  @Input() endTime: Date | undefined;

  private sessionsService: SessionsService = inject(SessionsService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected readonly weekdayOptions = REPEAT_WEEKDAYS;
  mode: RepeatMode = 'once';
  /** Date.getDay() values ticked for the weekly repeat. */
  protected weekdays: number[] = [];
  protected until: Date | undefined;
  /** Length of each make-up added after a regular session. */
  protected afterMinutes: number = 15;
  /** The tutor's sessions with the student (loaded once per tutor + student). */
  private regularSessions: Session[] | null = null;
  private regularKey: string = '';

  protected loading: boolean = false;
  protected error: string | null = null;
  private candidates: MakeupCandidate[] = [];
  protected plan: MakeupSetResult | null = null;
  protected rows: PreviewRow[] = [];

  /** Each new pattern replaces the preview in flight (switchMap). */
  private readonly refresh$ = new Subject<MakeupSetRequest | null>();

  constructor() {
    this.refresh$.pipe(
      tap(() => {
        this.plan = null;
        this.rows = [];
        this.error = null;
      }),
      switchMap(request => {
        if (!request) {
          this.loading = false;
          return of(null);
        }
        this.loading = true;
        return this.sessionsService.createMakeupSet(request, true).pipe(
          catchError((error: HttpErrorResponse) => {
            this.loading = false;
            this.error = messageOf(error, 'The preview could not be loaded. Please try again.');
            this.cdr.markForCheck();
            return EMPTY;
          }),
        );
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(plan => {
      this.loading = false;
      this.plan = plan;
      this.rows = plan ? this.rowsOf(plan) : [];
      this.cdr.markForCheck();
    });
  }

  ngOnChanges(): void {
    if (this.mode !== 'once') {
      this.refresh();
    }
  }

  protected get bounds(): {min: Date; max: Date} {
    return repeatUntilBounds(new Date(), this.student);
  }

  onModeChange(mode: RepeatMode): void {
    this.mode = mode;
    if (mode !== 'once') {
      if (!this.until) {
        this.until = this.bounds.max;
      }
      if (mode === 'weekly' && this.weekdays.length === 0 && this.date) {
        this.weekdays = [this.date.getDay()];
      }
      if (mode === 'after') {
        const entered = durationMinutes(this.startTime, this.endTime);
        if (entered > 0) {
          this.afterMinutes = entered;
        }
      }
    }
    this.refresh();
  }

  protected isWeekdayOn(day: number): boolean {
    return this.weekdays.includes(day);
  }

  onWeekdayToggle(day: number, on: boolean): void {
    this.weekdays = on
      ? [...new Set([...this.weekdays, day])]
      : this.weekdays.filter(d => d !== day);
    this.refresh();
  }

  onUntilChange(until: Date | null): void {
    this.until = until ?? undefined;
    this.refresh();
  }

  onAfterMinutesChange(minutes: number | null): void {
    this.afterMinutes = Number(minutes) || 0;
    this.refresh();
  }

  /** Rebuilds the proposed dates and asks the service which of them fit. */
  private refresh(): void {
    if (this.mode === 'once' || !this.student?.id || !this.tutorId || !this.until) {
      this.candidates = [];
      this.refresh$.next(null);
      return;
    }
    if (this.mode === 'weekly') {
      this.propose(this.date && this.startTime && this.endTime
        ? weeklyOccurrences(this.date, this.weekdays, this.until, this.startTime, this.endTime)
        : []);
      return;
    }
    this.regularSessionsOf(this.tutorId, this.student.id).subscribe(sessions => {
      this.propose(afterSessionOccurrences(sessions, this.tutorId!, this.afterMinutes, this.until!));
    });
  }

  private propose(candidates: MakeupCandidate[]): void {
    this.candidates = candidates;
    this.refresh$.next(candidates.length > 0 ? this.requestFor(candidates) : null);
    this.cdr.markForCheck();
  }

  /** The tutor's sessions with the student, read once per pair. */
  private regularSessionsOf(tutorId: string, studentId: string): Observable<Session[]> {
    const key = `${tutorId}|${studentId}`;
    if (this.regularSessions && this.regularKey === key) {
      return of(this.regularSessions);
    }
    return this.sessionsService.getSessions(tutorId, studentId).pipe(
      catchError(error => {
        console.log(error);
        this.error = 'The regular sessions could not be loaded. Please try again.';
        this.cdr.markForCheck();
        return EMPTY;
      }),
      tap(sessions => {
        this.regularSessions = sessions;
        this.regularKey = key;
      }),
      takeUntilDestroyed(this.destroyRef),
    );
  }

  private requestFor(sessions: MakeupCandidate[]): MakeupSetRequest {
    return {
      student_id: this.student!.id!,
      tutor_id: this.tutorId!,
      tutor_name: this.tutorName,
      sessions,
    };
  }

  private rowsOf(plan: MakeupSetResult): PreviewRow[] {
    const reasons = new Map(plan.skipped.map(s => [s.index, skipReasonText(s.reason)]));
    return this.candidates.map((candidate, index) => ({
      start: candidate.start_datetime,
      end: candidate.end_datetime,
      skipped: reasons.get(index) ?? '',
    }));
  }

  /** "12 of 14 fit · 180 min · 30 min left after" */
  protected get summary(): string {
    if (!this.plan) {
      return '';
    }
    const fit = this.plan.accepted.length;
    return `${fit} of ${this.candidates.length} fit · ${this.plan.minutes_used} min · `
      + `${this.plan.minutes_left} min left after`;
  }

  /** True when the pattern produced no dates at all (nothing to ask the service). */
  protected get nothingProposed(): boolean {
    return this.mode !== 'once' && !this.loading && !this.error && !this.plan && this.candidates.length === 0;
  }

  /** How many make-ups Save would create (0 while unknown). */
  get acceptedCount(): number {
    return this.plan?.accepted.length ?? 0;
  }

  /** Creates the make-ups the preview accepted. The service re-checks them. */
  save(notes: string = ''): Observable<MakeupSetResult> {
    const accepted = (this.plan?.accepted ?? []).map(index => this.candidates[index]);
    return this.sessionsService.createMakeupSet({...this.requestFor(accepted), notes}, false);
  }
}

/** The service explains a refusal (400/403/404); anything else is a plain failure. */
export function messageOf(error: HttpErrorResponse | undefined, fallback: string): string {
  const message: unknown = error?.error?.message;
  return typeof message === 'string' && message ? message : fallback;
}
