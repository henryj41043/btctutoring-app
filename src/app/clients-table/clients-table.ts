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
  clientColumns: string[] = ['date', 'tutor', 'student', 'start', 'end', 'attendance', 'notes', 'edit', 'delete'];
  clientData: Client[] = [];

  constructor(private cdr: ChangeDetectorRef) {}

  ngOnInit(): void {
    this.updateClientData();
  }

  private updateClientData(): void {
    console.log('updateClientData');
  }

  protected openCreateClientDialog(): void {
    console.log('openCreateClientDialog');
  }

  protected openEditClientDialog(item: any): void {
    console.log('openEditClientDialog');
  }

  protected openDeleteClientDialog(item: any): void {
    console.log('openDeleteClientDialog');
  }
}
