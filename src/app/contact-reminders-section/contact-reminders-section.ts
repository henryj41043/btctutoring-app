import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, Input, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {DatePipe} from '@angular/common';
import {MatButtonModule} from '@angular/material/button';
import {MatIconModule} from '@angular/material/icon';
import {MatTooltipModule} from '@angular/material/tooltip';
import {Router} from '@angular/router';
import {catchError, EMPTY} from 'rxjs';
import {ReminderService} from '../services/reminder.service';
import {AuthService} from '../services/auth.service';
import {Reminder} from '../models/reminder.model';

/**
 * The contact page's Outstanding Reminders card (admin-only — the reminders
 * endpoint is admin-gated). The host carries the page's section classes; it
 * hides itself entirely while there is nothing outstanding.
 */
@Component({
  selector: 'app-contact-reminders-section',
  imports: [DatePipe, MatButtonModule, MatIconModule, MatTooltipModule],
  templateUrl: './contact-reminders-section.html',
  styleUrl: './contact-reminders-section.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {'[style.display]': "outstandingReminders.length === 0 ? 'none' : null"},
})
export class ContactRemindersSection implements OnInit {
  @Input({required: true}) contactId!: string;

  private reminderService: ReminderService = inject(ReminderService);
  private authService: AuthService = inject(AuthService);
  private router: Router = inject(Router);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  // Cancels the in-flight read when the user navigates away.
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected outstandingReminders: Reminder[] = [];

  /** Outstanding = not completed; a sent-but-unfinished reminder still shows
   *  (same semantics as the Reminders page's default view). */
  ngOnInit(): void {
    if (!this.authService.isAdmin()) {
      return;
    }
    this.reminderService.getReminders().pipe(
      catchError(error => {
        console.log(error);
        return EMPTY;
      }),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(reminders => {
      this.outstandingReminders = reminders
        .filter(r => r.contact_id === this.contactId && !r.completed_at)
        .sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
      this.cdr.markForCheck();
    });
  }

  goToReminders(): void {
    void this.router.navigate(['/reminders']);
  }
}
