import {Service} from '../enums/service.enum';

export class Contact {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  service?: Service;
}
