import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatDialog} from '@angular/material/dialog';
import {catchError, Observable} from 'rxjs';
import {Response} from '../models/response.model';
import {DatePipe} from '@angular/common';
import {ClientsService} from '../services/clients.service';
import {Client} from '../models/client.model';
import {ClientDialog} from '../client-dialog/client-dialog';

@Component({
  selector: 'app-clients-table',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    DatePipe,
  ],
  templateUrl: './clients-table.html',
  styleUrl: './clients-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class ClientsTable implements OnInit {
  readonly clientDialog: MatDialog = inject(MatDialog);
  clientsService: ClientsService = inject(ClientsService);
  clientColumns: string[] = [
    'parent_name',
    'email',
    'phone_number',
    'student_name',
    'service',
    'status',
    'package',
    'assigned_tutor',
    'notes',
    'sessions',
    'makeup_sessions',
    'completed_sessions',
    'billing_cycle',
    'inquiry_date',
    'interview_scheduled',
    'student_birthday',
    'registration_received',
    'scholarship',
    'scholarship_name',
    'btc_and_me_enrolled',
    'edit',
    'delete'
  ];
  clientData: Client[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateClientData();
  }

  private updateClientData(): void {
    console.log('updateClientData');
    this.clientsService.getAllClients().pipe(
      catchError(error => {
        console.log(error);
        return new Observable();
      })
    ).subscribe(
      response => {
        console.log(response);
        this.clientData = response as Client[];
        this.cdr.markForCheck();
      }
    );
  }

  protected openCreateClientDialog(): void {
    console.log('openCreateClientDialog');
    const clientDialogRef = this.clientDialog.open(ClientDialog, {
      data: {type: 'create', client: new Client()},
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });

    clientDialogRef.afterClosed().subscribe((result: Client): void => {
      console.log('The create client dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.clientData = this.clientData.concat(result);
        this.cdr.markForCheck();
      }
    });
  }

  protected openEditClientDialog(item: any): void {
    console.log('openEditClientDialog');
    const clientDialogRef = this.clientDialog.open(ClientDialog, {
      data: {type: 'edit', client: item},
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });

    clientDialogRef.afterClosed().subscribe((result: Client): void => {
      console.log('The edit client dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.clientData = this.clientData.map((client: Client): Client => {
          if(client.email === result.email) {
            return result;
          }
          return client;
        });
        this.cdr.markForCheck();
      }
    });
  }

  protected openDeleteClientDialog(item: any): void {
    console.log('openDeleteClientDialog');
    const clientDialogRef = this.clientDialog.open(ClientDialog, {
      data: {type: 'delete', client: item},
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });

    clientDialogRef.afterClosed().subscribe((result: Response): void => {
      console.log('The delete client dialog was closed');
      if (result !== undefined) {
        console.log(result);
        this.clientData = this.clientData.filter(client => client.email !== result.id);
        this.cdr.markForCheck();
      }
    });
  }
}
