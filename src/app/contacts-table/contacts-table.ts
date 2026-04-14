import {ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatCardModule} from '@angular/material/card';
import {MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatDialog} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {ContactDialog} from '../contact-dialog/contact-dialog';
import {AuthService} from '../services/auth.service';
import {Contact} from '../models/contact.model';
import {ContactService} from '../services/contact.service';
import {Response} from '../models/response.model';
import {Router} from '@angular/router';

@Component({
  selector: 'app-contacts-table',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
  ],
  templateUrl: './contacts-table.html',
  styleUrl: './contacts-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class ContactsTable implements OnInit {
  readonly contactDialog: MatDialog = inject(MatDialog);
  private contactService: ContactService = inject(ContactService);
  private authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private router: Router = inject(Router);

  contactColumns: string[] = [
    'first_name',
    'last_name',
    'email',
    'phone_number',
    'service',
  ];
  contactData: Contact[] = [];

  ngOnInit(): void {
    this.updateClientData();
  }

  private updateClientData(): void {
    if(this.authService.user().groups.includes('Admins')) {
      this.contactService.getContacts().pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      ).subscribe(
        response => {
          console.log(response);
          this.contactData = response as Contact[];
          this.cdr.markForCheck();
        }
      );
    } else {
      // TODO: figure out what to do with non admins
    }
  }

  protected openContactDialog(): void {
    const contactDialogRef = this.contactDialog.open(ContactDialog, {
      maxWidth: '80vw',
      width: 'auto',
      maxHeight: '80vh',
      height: 'auto',
    });
    contactDialogRef.afterClosed().subscribe((response: Response) => {
      if (response) {
        void this.router.navigate([`/contacts`, response.id]);
      }
    });
  }

  protected contactClicked(contact: Contact): void {
    void this.router.navigate([`/contacts`, contact.id]);
  }
}
