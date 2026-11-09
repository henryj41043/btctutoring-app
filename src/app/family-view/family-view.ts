import {ChangeDetectionStrategy, ChangeDetectorRef, Component, DestroyRef, inject, OnInit} from '@angular/core';
import {takeUntilDestroyed} from '@angular/core/rxjs-interop';
import {ActivatedRoute, RouterLink} from '@angular/router';
import {HttpErrorResponse} from '@angular/common/http';
import {MatCardModule} from '@angular/material/card';
import {MatIconModule} from '@angular/material/icon';
import {MatButtonModule} from '@angular/material/button';
import {MatProgressSpinnerModule} from '@angular/material/progress-spinner';
import {ContactService} from '../services/contact.service';
import {ScheduleService} from '../services/schedule.service';
import {FamilySlot, FamilyStudent, FamilyView as Family} from '../models/family-view.model';
import {WEEKDAY_LABELS, Weekday} from '../enums/weekday.enum';
import {studentStatusChipClass} from '../utils/status-chip';

/**
 * Read-only family page for tutors (client 2026-11-09): the parent's name,
 * email, phone and address, and for each student on the tutor's roster the
 * schedule and the make-up time owed. No billing, no admin notes: the
 * service returns only those fields.
 */
@Component({
  selector: 'app-family-view',
  imports: [MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule, RouterLink],
  templateUrl: './family-view.html',
  styleUrl: './family-view.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
})
export class FamilyView implements OnInit {
  private route: ActivatedRoute = inject(ActivatedRoute);
  private contactService: ContactService = inject(ContactService);
  private scheduleService: ScheduleService = inject(ScheduleService);
  private cdr: ChangeDetectorRef = inject(ChangeDetectorRef);
  private destroyRef: DestroyRef = inject(DestroyRef);

  protected family: Family | null = null;
  protected loading: boolean = true;
  protected error: string = '';
  protected readonly statusChipClass = studentStatusChipClass;

  ngOnInit(): void {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(params => {
      this.load(params.get('id') ?? '');
    });
  }

  private load(id: string): void {
    this.loading = true;
    this.error = '';
    this.family = null;
    this.cdr.markForCheck();
    this.contactService.getFamily(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: family => {
        this.family = family;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.error = err?.status === 403
          ? 'This family has no student on your roster.'
          : err?.status === 404
            ? 'This family could not be found.'
            : 'The family could not be loaded. Please try again.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }

  protected get parentName(): string {
    return `${this.family?.first_name ?? ''} ${this.family?.last_name ?? ''}`.trim() || 'Parent / guardian';
  }

  /** "Media, PA 19063" (whatever parts are set). */
  protected get cityLine(): string {
    const f = this.family;
    if (!f) return '';
    const cityState = [f.city, f.state].filter(Boolean).join(', ');
    return [cityState, f.zip].filter(Boolean).join(' ');
  }

  protected get hasAddress(): boolean {
    const f = this.family;
    return !!f && !!(f.address_line1 || f.address_line2 || this.cityLine);
  }

  /** "Tue 4:00 PM to 4:45 PM", plus the tutor when the slot is someone else's. */
  protected slotLabel(student: FamilyStudent, slot: FamilySlot): string {
    const day = WEEKDAY_LABELS[slot.weekday as Weekday] ?? slot.weekday;
    const time = `${this.scheduleService.formatTime12(slot.start_time)} to ${this.scheduleService.formatTime12(slot.end_time)}`;
    const other = slot.tutor_id && slot.tutor_id !== student.assigned_tutor_id;
    return other ? `${day} ${time} with ${slot.tutor_name || 'another tutor'}` : `${day} ${time}`;
  }

  /** "45 min available, 30 min booked" for the make-up line. */
  protected makeupLabel(student: FamilyStudent): string {
    const booked = student.make_up_pending > 0 ? `, ${student.make_up_pending} min booked` : '';
    return `${student.make_up_available} min available${booked}`;
  }
}
