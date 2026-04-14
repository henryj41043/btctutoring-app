import {Package} from '../enums/package.enum';
import {Status} from '../enums/status.enum';

export class Student {
  id?: string;
  contact_id?: string;
  name?: string;
  birthday?: string;
  status?: Status;
  assigned_tutor_id?: string;
  package?: Package;
  available_minutes?: number;
  make_up_minutes?: number;
}
