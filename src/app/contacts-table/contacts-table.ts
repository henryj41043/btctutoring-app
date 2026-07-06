import {AfterViewInit, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatSort, MatSortModule} from '@angular/material/sort';
import {MatPaginator, MatPaginatorModule} from '@angular/material/paginator';
import {MatDialog} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {ContactDialog} from '../contact-dialog/contact-dialog';
import {DeleteContactDialog} from '../delete-contact-dialog/delete-contact-dialog';
import {AuthService} from '../services/auth.service';
import {Contact} from '../models/contact.model';
import {UserGroup} from '../enums/user-group.enum';
import {ContactService} from '../services/contact.service';
import {Response} from '../models/response.model';
import {Router} from '@angular/router';
import {PhonePipe} from '../pipes/phone.pipe';

@Component({
  selector: 'app-contacts-table',
  imports: [
    MatButtonModule,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatSortModule,
    MatPaginatorModule,
    MatFormFieldModule,
    MatInputModule,
    PhonePipe,
  ],
  templateUrl: './contacts-table.html',
  styleUrl: './contacts-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true
})
export class ContactsTable implements OnInit, AfterViewInit {
  readonly contactDialog: MatDialog = inject(MatDialog);
  private contactService: ContactService = inject(ContactService);
  private authService: AuthService = inject(AuthService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private router: Router = inject(Router);

  @ViewChild(MatSort) sort!: MatSort;
  @ViewChild(MatPaginator) paginator!: MatPaginator;

  contactColumns: string[] = ['first_name', 'last_name', 'email', 'phone_number', 'service', 'actions'];
  dataSource = new MatTableDataSource<Contact>([]);

  ngOnInit(): void {
    // Case-insensitive search across the visible columns.
    this.dataSource.filterPredicate = (contact, filter) => {
      const haystack = [
        contact.first_name, contact.last_name, contact.email,
        contact.phone_number, contact.service,
      ].join(' ').toLowerCase();
      return haystack.includes(filter);
    };
    this.updateClientData();
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
  }

  ngAfterViewInit(): void {
    this.dataSource.sort = this.sort;
    this.dataSource.paginator = this.paginator;
  }

  private updateClientData(): void {
    if (this.authService.isAdmin()) {
      this.contactService.getContacts().pipe(
        catchError(error => {
          console.log(error);
          return EMPTY;
        })
      ).subscribe(response => {
        this.dataSource.data = response as Contact[];
        this.cdr.markForCheck();
      });
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

  protected openDeleteDialog(contact: Contact): void {
    const ref = this.contactDialog.open(DeleteContactDialog, {
      data: contact,
      width: '420px',
    });
    ref.afterClosed().subscribe((deleted: boolean) => {
      if (deleted) {
        this.dataSource.data = this.dataSource.data.filter(c => c.id !== contact.id);
        this.cdr.markForCheck();
      }
    });
  }
}
