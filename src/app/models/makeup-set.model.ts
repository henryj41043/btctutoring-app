/** One proposed make-up of a set: just its times (ISO). */
export interface MakeupCandidate {
  start_datetime: string;
  end_datetime: string;
}

/** POST /sessions/makeup-set payload: one student, one tutor, many dates. */
export interface MakeupSetRequest {
  student_id: string;
  tutor_id: string;
  tutor_name?: string;
  notes?: string;
  sessions: MakeupCandidate[];
}

/**
 * Why a proposed make-up cannot be scheduled: the minutes are used up; they
 * exist today but lapse before that date; or the date is after the student's
 * last day of service.
 */
export type MakeupSkipReason = 'insufficient' | 'expired' | 'after_service_end';

/** The service's plan for a set (and, when it was not a dry run, what it created). */
export interface MakeupSetResult {
  /** Indexes into the sessions sent that the minutes cover. */
  accepted: number[];
  skipped: {index: number; reason: MakeupSkipReason}[];
  minutes_used: number;
  minutes_left: number;
  dry_run: boolean;
  created: number;
  ids: string[];
  series_id?: string;
}
