import {DestroyRef, ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, OnInit, ViewChild} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatCardModule} from '@angular/material/card';
import {MatTableDataSource, MatTableModule} from '@angular/material/table';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatInputModule} from '@angular/material/input';
import {MatTooltipModule} from '@angular/material/tooltip';
import {MatPaginatorModule, MatPaginator} from '@angular/material/paginator';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {MatDialog} from '@angular/material/dialog';
import {catchError, EMPTY, forkJoin, of} from 'rxjs';
import {EmailService} from '../services/email.service';
import {ContactService} from '../services/contact.service';
import {EmailEntry} from '../models/email-entry.model';
import {Contact} from '../models/contact.model';
import {AssignEmailDialog, AssignEmailDialogMode} from '../assign-email-dialog/assign-email-dialog';
import {TableStateStore} from '../utils/table-state';

/**
 * Admin-only review queue for forwarded emails the parser couldn't safely
 * file (unknown sender, ambiguous match, or unparseable forward). Nothing is
 * ever dropped — every email lands here or on a contact page. Rows expand to
 * the stripped body; Assign files onto a contact, Discard removes for good.
 */
@Component({
  selector: 'app-unmatched-emails',
  imports: [
    DatePipe,
    MatCardModule,
    MatTableModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './unmatched-emails.html',
  styleUrl: './unmatched-emails.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class UnmatchedEmails implements OnInit {
  private emailService: EmailService = inject(EmailService);
  private contactService: ContactService = inject(ContactService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight HTTP work when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);
  private dialog: MatDialog = inject(MatDialog);

  // Restores the admin's place (page/filter) after navigating away.
  private readonly viewState = new TableStateStore('btc-unmatched-emails-view');
  @ViewChild(MatPaginator) set matPaginator(paginator: MatPaginator) {
    if (paginator) {
      this.viewState.attachPaginator(paginator);
      this.dataSource.paginator = paginator;
    }
  }

  protected columns: string[] = ['received', 'from', 'subject', 'actions'];
  protected dataSource = new MatTableDataSource<EmailEntry>([]);
  protected loading: boolean = true;
  protected contacts: Contact[] = [];
  /** The entry whose stripped body is expanded. */
  protected expandedId: string | null = null;

  ngOnInit(): void {
    const savedFilter = this.viewState.load().filter;
    if (savedFilter) {
      this.dataSource.filter = savedFilter;
    }
    this.dataSource.filterPredicate = (entry, filter) => {
      const haystack = [entry.from_email, entry.from_name, entry.subject, entry.forwarded_by, entry.body_text]
        .join(' ')
        .toLowerCase();
      return haystack.includes(filter);
    };
    this.load();
  }

  private load(): void {
    this.loading = true;
    this.cdr.markForCheck();
    forkJoin({
      emails: this.emailService.getUnmatched()
        .pipe(catchError(error => { console.log(error); return of([] as EmailEntry[]); })),
      // Lean cached summary — the assign dialog only needs names + emails.
      contacts: this.contactService.getContactsSummary()
        .pipe(catchError(error => { console.log(error); return of([] as Contact[]); })),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(({emails, contacts}) => {
      this.dataSource.data = emails;
      this.contacts = contacts;
      this.loading = false;
      this.cdr.markForCheck();
    });
  }

  applyFilter(value: string): void {
    this.dataSource.filter = value.trim().toLowerCase();
    this.dataSource.paginator?.firstPage();
    this.viewState.patch({filter: this.dataSource.filter});
  }

  /** The restored search text, for the input's initial value. */
  protected get searchText(): string {
    return this.viewState.load().filter ?? '';
  }

  /** Sender display: the parsed original, or who forwarded it when unknown. */
  fromDisplay(entry: EmailEntry): string {
    if (entry.from_email) {
      return entry.from_name ? `${entry.from_name} <${entry.from_email}>` : entry.from_email;
    }
    return entry.forwarded_by ? `unknown — forwarded by ${entry.forwarded_by}` : 'unknown';
  }

  toggleExpanded(entry: EmailEntry): void {
    this.expandedId = this.expandedId === entry.id ? null : (entry.id ?? null);
  }

  isExpanded(entry: EmailEntry): boolean {
    return this.expandedId === entry.id;
  }

  openAssignDialog(entry: EmailEntry, event: Event): void {
    this.openDialog('assign', entry, event);
  }

  openDiscardDialog(entry: EmailEntry, event: Event): void {
    this.openDialog('discard', entry, event);
  }

  private openDialog(mode: AssignEmailDialogMode, entry: EmailEntry, event: Event): void {
    event.stopPropagation();
    const ref = this.dialog.open(AssignEmailDialog, {
      data: {mode, entry, contacts: this.contacts},
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.load();
      }
    });
  }

  /** Opens the raw original via a short-lived presigned link. */
  viewOriginal(entry: EmailEntry, event: Event): void {
    event.stopPropagation();
    if (!entry.id) {
      return;
    }
    this.emailService.getOriginalUrl(entry.id).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(({url}) => {
      window.open(url, '_blank');
    });
  }
}
