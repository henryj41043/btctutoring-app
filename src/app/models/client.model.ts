import {BillingCycle} from '../enums/billing-cycle.enum';
import {Package} from '../enums/package.enum';
import {ClientService} from '../enums/client-service.enum';
import {ClientStatus} from '../enums/client-status.enum';

export class Client {
  email?: string;
  assigned_tutor?: string;
  billing_cycle?: BillingCycle;
  btc_and_me_enrolled?: boolean;
  completed_sessions?: number;
  inquiry_date?: string;
  makeup_sessions?: number;
  notes?: string;
  package?: Package;
  parent_name?: string;
  phone_number?: string;
  registration_received?: boolean;
  scholarship?: boolean;
  scholarship_name?: string;
  service?: ClientService;
  sessions?: number;
  status?: ClientStatus;
  student_birthday?: string;
  student_name?: string;
}
