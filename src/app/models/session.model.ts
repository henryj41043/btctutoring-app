import {SessionStatus} from '../enums/session-status.enum';
import {SessionType} from '../enums/session-type.enum';

export class Session {
  id?: string;
  type?: SessionType;
  end_datetime?: string;
  notes?: string;
  start_datetime?: string;
  status?: SessionStatus;
  student_id?: string;
  student_name?: string;
  tutor_id?: string;
  tutor_name?: string;
  series_id?: string;
  /** Last time the notes were emailed to the parent (re-sends allowed). */
  notes_emailed_at?: string;
  /** Every attendance change, oldest first (written by the service only). */
  attendance_history?: AttendanceChange[];
  /** GROUP sessions only: the student roster (student_id stays empty). */
  participants?: SessionParticipant[];
}

/** One student in a GROUP session's roster. */
export interface SessionParticipant {
  id: string;
  name: string;
}

/** One attendance change on a session: who, when, why, and the minutes moved. */
export interface AttendanceChange {
  from: string;
  to: string;
  by: string;
  by_name?: string;
  at: string;
  reason?: string;
  minutes_delta?: number;
  unrecovered?: number;
}

/** PUT /sessions/:id/attendance payload. */
export interface AttendanceRequest {
  status: string;
  notes?: string;
  /** Required when an admin corrects attendance that was already taken. */
  reason?: string;
}

/** What the attendance route returns (and previews with a dry run). */
export interface AttendanceResult {
  session: Session;
  makeup: {before: number; after: number; delta: number; unrecovered: number};
  dry_run: boolean;
}
