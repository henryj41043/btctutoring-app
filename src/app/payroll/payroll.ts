import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableModule} from '@angular/material/table';
import {AuthService} from '../services/auth.service';
import {SessionsService} from '../services/sessions.service';
import {ContactService} from '../services/contact.service';
import {PayrollEntry} from '../models/payroll-entry.model';
import {DatePipe} from '@angular/common';
import {catchError, EMPTY} from 'rxjs';
import {Service} from '../enums/service.enum';
import {Status} from '../enums/status.enum';
import {SessionStatus} from '../enums/session-status.enum';

@Component({
  selector: 'app-payroll',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    DatePipe,
  ],
  templateUrl: './payroll.html',
  styleUrl: './payroll.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class Payroll implements OnInit {
  private authService: AuthService = inject(AuthService);
  private sessionsService: SessionsService = inject(SessionsService);
  private contactService: ContactService = inject(ContactService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  protected payrollColumns: string[] = [
    'name',
    'tutoring_hours',
    'administrative_time',
    'hours_subtotal',
    'pay_rate',
    'tutoring_compensation',
    'planning_time',
    'planning_rate',
    'planning_compensation',
    'total_compensation',
  ];
  protected payrollData: PayrollEntry[] = [];
  protected startDate: Date | undefined;
  protected endDate: Date | undefined;

  ngOnInit(): void {
    this.endDate = new Date();
    if (this.endDate.getDate() <= 15) {
      this.startDate = new Date(this.endDate.getFullYear(), this.endDate.getMonth(), 1);
    } else {
      this.startDate = new Date(this.endDate.getFullYear(), this.endDate.getMonth(), 16);
    }

    this.contactService.getContacts()
      .pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      )
      .subscribe(contacts => {
        contacts.forEach(contact => {
          if (contact.service === Service.HIRING && contact.status === Status.STAFF) {
            this.sessionsService.getSessionsByTutor(contact.id!)
              .pipe(
                catchError(error => {
                  console.log(error);
                  return EMPTY;
                })
              )
              .subscribe(sessions => {
                let payrollEntry: PayrollEntry = new PayrollEntry();
                payrollEntry.name = contact.first_name;
                payrollEntry.pay_rate = contact.hourly_rate;
                payrollEntry.planning_rate = 15;
                payrollEntry.administrative_time = 0;
                payrollEntry.tutoring_hours = 0;
                sessions.forEach(session => {
                  if (session.status === SessionStatus.COMPLETED || session.status === SessionStatus.NO_CALL_NO_SHOW) {
                    payrollEntry.tutoring_hours = payrollEntry.tutoring_hours! + this.calculateTime(session.start_datetime!, session.end_datetime!);
                  }
                });
                payrollEntry.planning_time = Math.round((payrollEntry.tutoring_hours / 6) * 100) / 100;
                payrollEntry.hours_subtotal = payrollEntry.tutoring_hours + payrollEntry.administrative_time;
                payrollEntry.planning_compensation = Math.round((payrollEntry.planning_time * payrollEntry.planning_rate) * 100) / 100;
                payrollEntry.tutoring_compensation = Math.round((payrollEntry.hours_subtotal * payrollEntry.pay_rate!) * 100) / 100;
                payrollEntry.total_compensation = payrollEntry.planning_compensation + payrollEntry.tutoring_compensation;
                console.log(payrollEntry);
                this.payrollData = [...this.payrollData, payrollEntry];
                this.cdr.markForCheck();
              });
          }
        });
      });
  }

  exportPDF(): void {
    console.log('exportPDF');
  }

  private calculateTime(startTime: string, endTime: string): number {
    let startDate = new Date(startTime);
    let endDate = new Date(endTime);
    if (startDate.getTime() < this.endDate!.getTime() && startDate.getTime() > this.startDate!.getTime()) {
      const msInHour = 1000 * 60 * 60;
      return Math.round(((endDate.getTime() - startDate.getTime()) / msInHour) * 100) / 100;
    } else {
      return 0;
    }
  }
}
