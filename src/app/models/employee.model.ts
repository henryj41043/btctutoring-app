import {EmployeeStatus} from '../enums/employee-status.enum';
import {EmployeeService} from '../enums/employee-service.enum';
import {UserGroup} from '../enums/user-group.enum';

export class Employee {
  email!: string;
  first_name!: string;
  last_name!: string;
  phone_number!: string;
  group!: UserGroup;
  status!: EmployeeStatus;
  service!: EmployeeService;
  notes!: string;
  interview_scheduled!: boolean;
}
