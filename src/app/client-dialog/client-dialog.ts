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

@Component({
  selector: 'app-client-dialog',
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
  ],
  templateUrl: './client-dialog.html',
  styleUrl: './client-dialog.scss'
})
export class ClientDialog implements OnInit {
  readonly dialogRef = inject(MatDialogRef<ClientDialog>);
  readonly dialogData = inject<ClientDialogData>(MAT_DIALOG_DATA);
  clientsService: ClientsService = inject(ClientsService);

  parentName: string = '';

  ngOnInit(): void {
    if(this.dialogData.type !== 'create') {
      // prepopulate existing values
      this.parentName = this.dialogData.client.parent_name as string;
    }
  }

  cancel(): void {
    this.dialogRef.close();
  }

  createClient(): void {
    let client: Client = new Client();
    // update client values
    console.log(client);
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
    let client: Client = new Client();
    // update client values
    console.log(client);
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
