import {SessionStatus} from '../enums/session-status.enum';

export class Session {
  id?: string;
  end_datetime?: string;
  notes?: string;
  start_datetime?: string;
  status?: SessionStatus;
  student_id?: string;
  student_name?: string;
  tutor_id?: string;
  tutor_name?: string;
}
