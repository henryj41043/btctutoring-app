import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatDialog} from '@angular/material/dialog';
import {catchError, Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {EmployeeService} from '../services/employee.service';
import {Employee} from '../models/employee.model';
import {EmployeeDialog} from '../employee-dialog/employee-dialog';
import {DialogType} from '../enums/dialog-type.enum';

@Component({
  selector: 'app-employees-table',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
  ],
  templateUrl: './employees-table.html',
  styleUrl: './employees-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class EmployeesTable implements OnInit {
  readonly employeeDialog: MatDialog = inject(MatDialog);
  employeeService: EmployeeService = inject(EmployeeService);
  employeeColumns: string[] = [
    'email',
    'first_name',
    'last_name',
    'phone_number',
    'group',
    'status',
    'service',
    'notes',
    'interview_scheduled',
    'edit',
    'delete'
  ];
  employeeData: Employee[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateEmployeeData();
  }

  private updateEmployeeData(): void {
    console.log('updateEmployeeData');
    this.employeeService.getAllEmployees().pipe(
      catchError(error => {
        console.log(error);
        return new Observable();
      })
    ).subscribe(
      response => {
        console.log(response);
        this.employeeData = response as Employee[];
        this.cdr.markForCheck();
      }
    );
  }

  protected openCreateEmployeeDialog(): void {
    console.log('openCreateEmployeeDialog');
    const employeeDialogRef = this.employeeDialog.open(EmployeeDialog, {
      data: {type: DialogType.CREATE, employee: null},
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });

    employeeDialogRef.afterClosed().subscribe((result: Employee): void => {
      console.log('The create employee dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.employeeData = this.employeeData.concat(result);
        this.cdr.markForCheck();
      }
    });
  }

  protected openEditEmployeeDialog(item: any): void {
    console.log('openEditEmployeeDialog');
    const employeeDialogRef = this.employeeDialog.open(EmployeeDialog, {
      data: {type: DialogType.EDIT, employee: item},
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });

    employeeDialogRef.afterClosed().subscribe((result: Employee): void => {
      console.log('The edit employee dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.employeeData = this.employeeData.map((employee: Employee): Employee => {
          if(employee.email === result.email) {
            return result;
          }
          return employee;
        });
        this.cdr.markForCheck();
      }
    });
  }

  protected openDeleteEmployeeDialog(item: any): void {
    console.log('openDeleteEmployeeDialog');
    const employeeDialogRef = this.employeeDialog.open(EmployeeDialog, {
      data: {type: DialogType.DELETE, employee: item},
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });

    employeeDialogRef.afterClosed().subscribe((result: Response): void => {
      console.log('The delete employee dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.employeeData = this.employeeData.filter(employee => employee.email !== result.id);
        this.cdr.markForCheck();
      }
    });
  }
}
