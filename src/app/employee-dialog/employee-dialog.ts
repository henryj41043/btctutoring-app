import {Component, inject, OnInit} from '@angular/core';
import {MAT_DIALOG_DATA, MatDialogRef} from '@angular/material/dialog';
import {EmployeeDialogData} from '../interfaces/employee-dialog-data.interface';
import {EmployeeService} from '../services/employee.service';
import {UserGroup} from '../enums/user-group.enum';
import {EmployeeService as EmployeeServiceEnum} from '../enums/employee-service.enum';
import {EmployeeStatus} from '../enums/employee-status.enum';
import {Employee} from '../models/employee.model';
import {catchError, Observable} from 'rxjs';
import {Response} from '../models/response.model';

@Component({
  selector: 'app-employee-dialog',
  imports: [],
  templateUrl: './employee-dialog.html',
  styleUrl: './employee-dialog.scss'
})
export class EmployeeDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<EmployeeDialog>);
  readonly dialogData = inject<EmployeeDialogData>(MAT_DIALOG_DATA);
  employeeService: EmployeeService = inject(EmployeeService);

  email: string = '';
  firstName: string = '';
  lastName: string = '';
  phoneNumber: string = '';
  group: string = '';
  status: string = '';
  service: string = '';
  notes: string = '';
  interviewScheduled: boolean = false;

  createUser: boolean = false;
  groupOptions: string[] = Object.values(UserGroup);
  statusOptions: string[] = Object.values(EmployeeStatus);
  serviceOptions: string[] = Object.values(EmployeeService);

  ngOnInit(): void {
    if(this.dialogData.type !== 'create') {
      this.email = this.dialogData.employee.email;
      this.firstName = this.dialogData.employee.first_name;
      this.lastName = this.dialogData.employee.last_name;
      this.phoneNumber = this.dialogData.employee.phone_number;
      this.group = this.dialogData.employee.group;
      this.status = this.dialogData.employee.status;
      this.service = this.dialogData.employee.service;
      this.notes = this.dialogData.employee.notes;
      this.interviewScheduled = this.dialogData.employee.interview_scheduled;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  createEmployee(): void {
    let employee: Employee = this.buildEmployeeFromForm();
    this.employeeService.createEmployee(employee).pipe(
      catchError(err =>  {
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      response => {
        console.log(response);
        this.dialogRef.close(employee);
      }
    );
  }

  updateEmployee(): void {
    let employee: Employee = this.buildEmployeeFromForm();
    this.employeeService.updateEmployee(employee).pipe(
      catchError(err =>  {
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      response => {
        console.log(response);
        this.dialogRef.close(response as Employee);
      }
    );
  }

  deleteEmployee(): void {
    let id: string = this.dialogData.employee.email as string;
    console.log('Attempting to delete: ' + id);
    this.employeeService.deleteEmployee(id).pipe(
      catchError(err =>  {
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      response => {
        console.log(response);
        this.dialogRef.close(response as Response);
      }
    );
  }

  private buildEmployeeFromForm(): Employee {
    let employee: Employee = new Employee();
    employee.email = this.email;
    employee.first_name = this.firstName;
    employee.last_name = this.lastName;
    employee.phone_number = this.phoneNumber;
    employee.group = this.group as UserGroup;
    employee.status = this.status as EmployeeStatus;
    employee.service = this.service as EmployeeServiceEnum;
    employee.notes = this.notes;
    employee.interview_scheduled = this.interviewScheduled;
    console.log(employee);
    return employee;
  }
}
