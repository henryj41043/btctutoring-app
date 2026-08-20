import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatDialog} from '@angular/material/dialog';
import {catchError, EMPTY} from 'rxjs';
import {EmailService} from '../services/email.service';
import {AuthService} from '../services/auth.service';
import {EmailEntry} from '../models/email-entry.model';
import {AssignEmailDialog} from '../assign-email-dialog/assign-email-dialog';

/**
 * The contact page's Emails card: forwarded parent emails the pipeline filed
 * on this contact (admin-only, read-only). The host carries the page's
 * section classes; it hides itself entirely while nothing is filed.
 */
@Component({
  selector: 'app-contact-emails-section',
  imports: [DatePipe, MatButtonModule, MatIconModule],
  templateUrl: './contact-emails-section.html',
  styleUrl: './contact-emails-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'[style.display]': "contactEmails.length === 0 ? 'none' : null"},
})
export class ContactEmailsSection implements OnInit {
  @Input({required: true}) contactId!: string;

  private emailService: EmailService = inject(EmailService);
  private authService: AuthService = inject(AuthService);
  private dialog: MatDialog = inject(MatDialog);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels in-flight reads when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected contactEmails: EmailEntry[] = [];
  /** The email entry whose full body is expanded. */
  protected expandedEmailId: string | null = null;

  ngOnInit(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.loadContactEmails();
  }

  /** Emails the pipeline filed on this contact, already newest-first. */
  private loadContactEmails(): void {
    this.emailService.getEmailsForContact(this.contactId).pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(emails => {
      this.contactEmails = emails;
      this.cdr.markForCheck();
    });
  }

  toggleEmail(entry: EmailEntry): void {
    this.expandedEmailId = this.expandedEmailId === entry.id ? null : (entry.id ?? null);
    this.cdr.markForCheck();
  }

  /** Removes a filed email from this contact (discard — it can't resurface). */
  removeEmail(entry: EmailEntry, event: Event): void {
    event.stopPropagation();
    const ref = this.dialog.open(AssignEmailDialog, {
      data: {mode: 'discard', entry, contacts: []},
      width: '440px',
    });
    ref.afterClosed().subscribe(result => {
      if (result) {
        this.loadContactEmails();
      }
    });
  }

  /** Opens the raw original via a short-lived presigned link (fetched on click). */
  viewOriginalEmail(entry: EmailEntry, event: Event): void {
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
