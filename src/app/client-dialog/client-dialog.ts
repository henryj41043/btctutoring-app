import {Component, inject, OnInit} from '@angular/core';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import {ClientsService} from '../services/clients.service';
import {ClientDialogData} from '../interfaces/client-dialog-data.interface';
import {Client} from '../models/client.model';
import {catchError, Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {FormsModule} from '@angular/forms';
import {MatSelectModule} from '@angular/material/select';
import {MatButtonModule} from '@angular/material/button';
import {MatDatepickerModule} from '@angular/material/datepicker';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTimepickerModule} from '@angular/material/timepicker';
import {BillingCycle} from '../enums/billing-cycle.enum';
import {Package} from '../enums/package.enum';
import {Service} from '../enums/service.enum';
import {ClientStatus} from '../enums/client-status.enum';
import {MatCheckbox} from '@angular/material/checkbox';
import {provideNativeDateAdapter} from '@angular/material/core';

@Component({
  selector: 'app-client-dialog',
  providers: [provideNativeDateAdapter()],
  imports: [
    MatDialogTitle,
    MatDialogContent,
    MatDialogActions,
    MatFormFieldModule,
    MatInputModule,
    FormsModule,
    MatButtonModule,
    MatTimepickerModule,
    MatDatepickerModule,
    MatSelectModule,
    MatCheckbox,
  ],
  templateUrl: './client-dialog.html',
  styleUrl: './client-dialog.scss'
})
export class ClientDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<ClientDialog>);
  readonly dialogData = inject<ClientDialogData>(MAT_DIALOG_DATA);
  clientsService: ClientsService = inject(ClientsService);

  parentName: string = '';
  email: string = '';
  assignedTutor: string = '';
  billingCycle: string = '';
  btcAndMeEnrolled: boolean = false;
  completedSessions: number = 0;
  inquiryDate: Date = new Date();
  interviewScheduled: boolean = false;
  makeupSessions: number = 0;
  notes: string = '';
  package: string = '';
  phoneNumber: string = '';
  registrationReceived: boolean = false;
  scholarship: boolean = false;
  scholarshipName: string = '';
  service: string = '';
  sessions: number = 0;
  status: string = '';
  studentBirthday: Date = new Date();
  studentName: string = '';

  billingCycleOptions: string[] = Object.values(BillingCycle);
  packageOptions: string[] = Object.values(Package);
  serviceOptions: string[] = Object.values(Service);
  statusOptions: string[] = Object.values(ClientStatus);
  tutorOptions: string[] = ['Yoshi', 'Mario']; // TODO: this should populate from employee table

  ngOnInit(): void {
    if(this.dialogData.type !== 'create') {
      this.parentName = this.dialogData.client.parent_name as string;
      this.email = this.dialogData.client.email as string;
      this.assignedTutor = this.dialogData.client.assigned_tutor as string;
      this.billingCycle = this.dialogData.client.billing_cycle as BillingCycle;
      this.btcAndMeEnrolled = this.dialogData.client.btc_and_me_enrolled as boolean;
      this.completedSessions = this.dialogData.client.completed_sessions as number;
      this.inquiryDate = new Date(this.dialogData.client.inquiry_date as string);
      this.interviewScheduled = this.dialogData.client.interview_scheduled as boolean;
      this.makeupSessions = this.dialogData.client.makeup_sessions as number;
      this.notes = this.dialogData.client.notes as string;
      this.package = this.dialogData.client.package as Package;
      this.phoneNumber = this.dialogData.client.phone_number as string;
      this.registrationReceived = this.dialogData.client.registration_received as boolean;
      this.scholarship = this.dialogData.client.scholarship as boolean;
      this.scholarshipName = this.dialogData.client.scholarship_name as string;
      this.service = this.dialogData.client.service as Service;
      this.sessions = this.dialogData.client.sessions as number;
      this.status = this.dialogData.client.status as ClientStatus;
      this.studentBirthday = new Date(this.dialogData.client.student_birthday as string);
      this.studentName = this.dialogData.client.student_name as string;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  createClient(): void {
    let client: Client = this.buildClientFromForm();
    this.clientsService.createClient(client).pipe(
      catchError(err =>  {
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      response => {
        console.log(response);
        this.dialogRef.close(client);
      }
    );
  }

  updateClient(): void {
    let client: Client = this.buildClientFromForm();
    this.clientsService.updateClient(client).pipe(
      catchError(err =>  {
        console.log(err);
        return new Observable();
      })
    ).subscribe(
      response => {
        console.log(response);
        this.dialogRef.close(response as Client);
      }
    );
  }

  private buildClientFromForm(): Client {
    let client: Client = new Client();
    client.parent_name = this.parentName;
    client.email = this.email;
    client.assigned_tutor = this.assignedTutor;
    client.billing_cycle = this.billingCycle;
    client.btc_and_me_enrolled = this.btcAndMeEnrolled;
    client.completed_sessions = Number(this.completedSessions);
    client.inquiry_date = this.inquiryDate.toISOString();
    client.interview_scheduled = this.interviewScheduled;
    client.makeup_sessions = Number(this.makeupSessions);
    client.notes = this.notes;
    client.package = this.package;
    client.phone_number = this.phoneNumber;
    client.registration_received = this.registrationReceived;
    client.scholarship = this.scholarship;
    client.scholarship_name = this.scholarshipName;
    client.service = this.service;
    client.sessions = Number(this.sessions);
    client.status = this.status;
    client.student_birthday = this.studentBirthday.toISOString();
    client.student_name = this.studentName;
    console.log(client);
    return client;
  }

  deleteClient(): void {
    let id: string = this.dialogData.client.email as string;
    console.log('Attempting to delete: ' + id);
    this.clientsService.deleteClient(id).pipe(
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
}
