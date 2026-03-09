import {Employee} from '../models/employee.model';
import {DialogType} from '../enums/dialog-type.enum';

export interface EmployeeDialogData {
  type: DialogType;
  employee: Employee;
}
