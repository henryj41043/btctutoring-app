import {Session} from '../models/session.model';

export interface SessionDialogData {
  type: string;
  session: Session;
}
