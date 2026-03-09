import {Component, inject, OnInit, signal, WritableSignal} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle
} from '@angular/material/dialog';
import {EmployeeDialogData} from '../interfaces/employee-dialog-data.interface';
import {EmployeeService} from '../services/employee.service';
import {UserGroup} from '../enums/user-group.enum';
import {EmployeeStatus} from '../enums/employee-status.enum';
import {EmployeeService as EmployeeServices} from '../enums/employee-service.enum';
import {Employee} from '../models/employee.model';
import {catchError, Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {MatButtonModule} from '@angular/material/button';
import {MatCheckbox} from '@angular/material/checkbox';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatSelectModule} from '@angular/material/select';
import {FormBuilder, FormGroup, ReactiveFormsModule, Validators} from '@angular/forms';
import {MatIconModule} from '@angular/material/icon';
import {DialogType} from '../enums/dialog-type.enum';

@Component({
  selector: 'app-employee-dialog',
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatCheckbox,
    ReactiveFormsModule,
    MatIconModule
  ],
  templateUrl: './employee-dialog.html',
  styleUrl: './employee-dialog.scss'
})
export class EmployeeDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<EmployeeDialog>);
  readonly dialogData = inject<EmployeeDialogData>(MAT_DIALOG_DATA);
  private employeeService: EmployeeService = inject(EmployeeService);
  private formBuilder: FormBuilder = inject(FormBuilder);

  protected employeeForm!: FormGroup;
  protected emailErrorMessage: WritableSignal<string> = signal('');
  protected phoneNumberPattern: string = '^\\(?\\d{3}\\)?[\\s.-]?\\d{3}[\\s.-]?\\d{4}$'

  protected groupOptions: string[] = Object.values(UserGroup);
  protected statusOptions: string[] = Object.values(EmployeeStatus);
  protected serviceOptions: string[] = Object.values(EmployeeServices);

  ngOnInit(): void {
    this.employeeForm = this.formBuilder.nonNullable.group({
      email: [this.dialogData.employee?.email ?? '', [Validators.required, Validators.email]],
      first_name: [this.dialogData.employee?.first_name ?? '', [Validators.required, Validators.minLength(1)]],
      last_name: [this.dialogData.employee?.last_name ?? '', [Validators.required, Validators.minLength(1)]],
      phone_number: [this.dialogData.employee?.phone_number ?? '', [Validators.required, Validators.pattern(this.phoneNumberPattern)]],
      group: [this.dialogData.employee?.group ?? '', [Validators.required]],
      status: [this.dialogData.employee?.status ?? '', Validators.required],
      service: [this.dialogData.employee?.service ?? '', [Validators.required]],
      notes: [this.dialogData.employee?.notes ?? '', [Validators.required]],
      interview_scheduled: [this.dialogData.employee?.interview_scheduled ?? false, [Validators.required]]
    });
    if (this.dialogData.type === DialogType.DELETE) {
      this.employeeForm.disable();
    } else if (this.dialogData.type === DialogType.EDIT) {
      this.employeeForm.controls['email'].disable();
      this.employeeForm.controls['group'].disable();
    }
  }

  protected cancel(): void {
    this.dialogRef.close();
  }

  protected submitForm() {
    switch (this.dialogData.type) {
      case DialogType.CREATE:
        this.createEmployee();
        break;
      case DialogType.EDIT:
        this.updateEmployee();
        break;
      case DialogType.DELETE:
        this.deleteEmployee();
        break;
      default:
        return;
    }
  }

  private createEmployee(): void {
    if(this.employeeForm.invalid) return;
    let employee: Employee = this.employeeForm.value as Employee;
    this.employeeService.createEmployee(employee).pipe(
      catchError(err =>  {
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      employeeResponse => {
        console.log(employeeResponse);
        this.employeeService.adminCreateUser(employee.email, employee.group).pipe(
          catchError(err => {
            console.log(err);
            return new Observable();
          })
        ).subscribe(
          adminResponse => {
            console.log(adminResponse);
            this.dialogRef.close(employee);
          }
        );
      }
    );
  }

  private updateEmployee(): void {
    if(this.employeeForm.invalid) return;
    let employee: Employee = this.employeeForm.value as Employee;
    employee.email = this.dialogData.employee.email;
    employee.group = this.dialogData.employee.group;
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

  private deleteEmployee(): void {
    let id: string = this.dialogData.employee.email as string;
    console.log('Attempting to delete: ' + id);
    this.employeeService.deleteEmployee(id).pipe(
      catchError(err =>  {
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      employeeResponse => {
        console.log(employeeResponse);
        this.employeeService.adminDeleteUser(id).pipe(
          catchError(err =>  {
            console.log(err);
            return new Observable();
          })
        ).subscribe(
          adminResponse => {
            console.log(adminResponse);
            this.dialogRef.close(employeeResponse as Response);
          }
        );
      }
    );
  }

  protected updateEmailErrorMessage() {
    if (this.employeeForm.controls['email'].hasError('required')) {
      this.emailErrorMessage.set('You must enter a value');
    } else if (this.employeeForm.controls['email'].hasError('email')) {
      this.emailErrorMessage.set('Not a valid email');
    } else {
      this.emailErrorMessage.set('');
    }
  }

  protected readonly DialogType = DialogType;
}
