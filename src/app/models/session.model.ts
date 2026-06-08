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
}
