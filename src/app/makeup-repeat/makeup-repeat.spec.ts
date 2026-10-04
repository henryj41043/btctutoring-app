import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { of, Subject, throwError } from 'rxjs';
import { MakeupRepeat, messageOf } from './makeup-repeat';
import { SessionsService } from '../services/sessions.service';
import { MakeupSetRequest, MakeupSetResult } from '../models/makeup-set.model';
import { Session } from '../models/session.model';
import { Student } from '../models/student.model';
import { SessionType } from '../enums/session-type.enum';
import { SessionStatus } from '../enums/session-status.enum';

const plan = (over: Partial<MakeupSetResult> = {}): MakeupSetResult => ({
  accepted: [0, 1],
  skipped: [],
  minutes_used: 30,
  minutes_left: 60,
  dry_run: true,
  created: 0,
  ids: [],
  ...over,
});

describe('MakeupRepeat', () => {
  const sessionsService = { createMakeupSet: jest.fn(), getSessions: jest.fn() };
  let fixture: ComponentFixture<MakeupRepeat>;
  let c: MakeupRepeat;
  const student = { id: 's-1', name: 'Pat', make_up_minutes: 90 } as Student;

  const build = (inputs: Record<string, unknown> = {}): MakeupRepeat => {
    TestBed.configureTestingModule({
      imports: [MakeupRepeat],
      providers: [
        provideNoopAnimations(),
        provideNativeDateAdapter(),
        { provide: SessionsService, useValue: sessionsService },
      ],
    });
    fixture = TestBed.createComponent(MakeupRepeat);
    c = fixture.componentInstance;
    const all = {
      student,
      tutorId: 't-1',
      tutorName: 'Tess',
      date: new Date(2026, 9, 6), // Tue
      startTime: new Date(2026, 9, 6, 16, 0),
      endTime: new Date(2026, 9, 6, 16, 15),
      ...inputs,
    };
    Object.entries(all).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    return c;
  };
  const lastRequest = (): MakeupSetRequest => sessionsService.createMakeupSet.mock.calls.at(-1)![0];
  const el = (): HTMLElement => {
    fixture.componentRef.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    return fixture.nativeElement;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 9, 5, 9, 0)); // Mon Oct 5 2026
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    sessionsService.createMakeupSet.mockReturnValue(of(plan()));
    sessionsService.getSessions.mockReturnValue(of([]));
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('starts on "Just this once" and asks the service for nothing', () => {
    build();
    expect(c.mode).toBe('once');
    expect(c.acceptedCount).toBe(0);
    expect(sessionsService.createMakeupSet).not.toHaveBeenCalled();
    expect(el().querySelector('.repeat-preview')).toBeNull();
    // Changing the form above does not start a preview either.
    fixture.componentRef.setInput('date', new Date(2026, 9, 7));
    fixture.detectChanges();
    expect(sessionsService.createMakeupSet).not.toHaveBeenCalled();
  });

  describe('weekly', () => {
    it('pre-ticks the chosen date\'s weekday, runs to the look-ahead, and previews with a dry run', () => {
      build();
      c.onModeChange('weekly');
      expect(c['weekdays']).toEqual([2]);
      expect(c['until']).toEqual(new Date(2027, 0, 31));
      expect(sessionsService.createMakeupSet).toHaveBeenCalledTimes(1);
      expect(sessionsService.createMakeupSet.mock.calls[0][1]).toBe(true);
      const request = lastRequest();
      expect(request).toMatchObject({ student_id: 's-1', tutor_id: 't-1', tutor_name: 'Tess' });
      expect(request).not.toHaveProperty('notes');
      expect(request.sessions).toHaveLength(17); // Tuesdays Oct 6 .. Jan 26
      expect(new Date(request.sessions[0].start_datetime)).toEqual(new Date(2026, 9, 6, 16, 0));
      expect(c.acceptedCount).toBe(2);
    });

    it('shows the summary, the dates and why a date was skipped', () => {
      build();
      c.onModeChange('weekly');
      c.onUntilChange(new Date(2026, 9, 20));
      sessionsService.createMakeupSet.mockReturnValue(of(plan({
        accepted: [0, 1],
        skipped: [{ index: 2, reason: 'expired' }],
      })));
      c.onUntilChange(new Date(2026, 9, 20));
      const html = el();
      expect(html.querySelector('.repeat-summary')?.textContent).toBe('2 of 3 fit · 30 min · 60 min left after');
      const rows = Array.from(html.querySelectorAll('.repeat-preview li'));
      expect(rows).toHaveLength(3);
      expect(rows[0].textContent?.replace(/\s+/g, ' ').trim()).toBe('Tue, Oct 6 · 4:00 PM to 4:15 PM');
      expect(rows[2].classList.contains('repeat-skipped')).toBe(true);
      expect(rows[2].querySelector('.repeat-reason')?.textContent).toBe('Skipped: minutes expire before this date');
      expect(rows[0].classList.contains('repeat-skipped')).toBe(false);
    });

    it('re-previews when a weekday, the until date or the form above changes', () => {
      build();
      c.onModeChange('weekly');
      c.onWeekdayToggle(4, true);
      expect(c['weekdays']).toEqual([2, 4]);
      expect(c['isWeekdayOn'](4)).toBe(true);
      c.onWeekdayToggle(4, true); // ticking twice does not duplicate
      expect(c['weekdays']).toEqual([2, 4]);
      c.onWeekdayToggle(2, false);
      expect(c['weekdays']).toEqual([4]);
      expect(c['isWeekdayOn'](2)).toBe(false);
      c.onUntilChange(new Date(2026, 9, 31));
      const calls = sessionsService.createMakeupSet.mock.calls.length;
      fixture.componentRef.setInput('startTime', new Date(2026, 9, 6, 17, 0));
      fixture.componentRef.setInput('endTime', new Date(2026, 9, 6, 17, 30));
      fixture.detectChanges();
      expect(sessionsService.createMakeupSet.mock.calls.length).toBe(calls + 1);
      expect(new Date(lastRequest().sessions[0].start_datetime)).toEqual(new Date(2026, 9, 8, 17, 0));
    });

    it('says so when no date matches, and asks the service for nothing', () => {
      build();
      c.onModeChange('weekly');
      sessionsService.createMakeupSet.mockClear();
      c.onWeekdayToggle(2, false);
      expect(sessionsService.createMakeupSet).not.toHaveBeenCalled();
      expect(c.acceptedCount).toBe(0);
      expect(el().querySelector('.repeat-empty')?.textContent).toBe('No dates match this pattern.');
    });

    it.each([
      ['a student', { student: undefined }],
      ['a student id', { student: { name: 'x' } }],
      ['a tutor', { tutorId: undefined }],
      ['a date', { date: undefined }],
      ['a start time', { startTime: undefined }],
      ['an end time', { endTime: undefined }],
    ])('previews nothing without %s', (_what, inputs) => {
      build(inputs);
      c.onModeChange('weekly');
      expect(sessionsService.createMakeupSet).not.toHaveBeenCalled();
    });

    it('previews nothing once the until date is cleared', () => {
      build();
      c.onModeChange('weekly');
      sessionsService.createMakeupSet.mockClear();
      c.onUntilChange(null);
      expect(sessionsService.createMakeupSet).not.toHaveBeenCalled();
      expect(c.acceptedCount).toBe(0);
    });

    it('keeps the weekdays and the until date already chosen when switching modes', () => {
      build();
      c.onModeChange('weekly');
      c.onWeekdayToggle(4, true);
      c.onUntilChange(new Date(2026, 9, 31));
      c.onModeChange('once');
      c.onModeChange('weekly');
      expect(c['weekdays']).toEqual([2, 4]);
      expect(c['until']).toEqual(new Date(2026, 9, 31));
    });

    it('shows a spinner while the preview is loading and drops a stale answer', () => {
      const first = new Subject<MakeupSetResult>();
      const second = new Subject<MakeupSetResult>();
      sessionsService.createMakeupSet.mockReturnValueOnce(first).mockReturnValueOnce(second);
      build();
      c.onModeChange('weekly');
      expect(el().querySelector('mat-spinner')).not.toBeNull();
      c.onUntilChange(new Date(2026, 9, 20));
      first.next(plan({ accepted: [0] }));
      expect(c.acceptedCount).toBe(0); // the first answer is no longer wanted
      second.next(plan({ accepted: [0, 1, 2] }));
      expect(c.acceptedCount).toBe(3);
      expect(el().querySelector('mat-spinner')).toBeNull();
    });

    it('shows the reason the service gives when the preview is refused, and recovers', () => {
      sessionsService.createMakeupSet.mockReturnValueOnce(throwError(() => new HttpErrorResponse({
        status: 400, error: { message: 'Make-ups can only be scheduled for an active student.' },
      })));
      build();
      c.onModeChange('weekly');
      expect(el().querySelector('.repeat-error')?.textContent)
        .toBe('Make-ups can only be scheduled for an active student.');
      expect(c.acceptedCount).toBe(0);
      c.onUntilChange(new Date(2026, 9, 20));
      expect(el().querySelector('.repeat-error')).toBeNull();
      expect(c.acceptedCount).toBe(2);
    });
  });

  describe('after each regular session', () => {
    const regular = (day: number, over: Partial<Session> = {}): Session => ({
      type: SessionType.TUTORING,
      status: SessionStatus.PENDING,
      tutor_id: 't-1',
      start_datetime: new Date(2026, 9, day, 15, 0).toISOString(),
      end_datetime: new Date(2026, 9, day, 15, 45).toISOString(),
      ...over,
    } as Session);

    it('reads the tutor\'s sessions with the student once and adds the entered length after each', () => {
      sessionsService.getSessions.mockReturnValue(of([regular(7), regular(14), regular(8, { type: SessionType.MAKE_UP })]));
      build();
      c.onModeChange('after');
      expect(sessionsService.getSessions).toHaveBeenCalledWith('t-1', 's-1');
      expect(c['afterMinutes']).toBe(15); // the length of the times entered above
      expect(lastRequest().sessions.map(s => new Date(s.start_datetime))).toEqual([
        new Date(2026, 9, 7, 15, 45), new Date(2026, 9, 14, 15, 45),
      ]);
      expect(new Date(lastRequest().sessions[0].end_datetime)).toEqual(new Date(2026, 9, 7, 16, 0));

      c.onAfterMinutesChange(30);
      expect(new Date(lastRequest().sessions[0].end_datetime)).toEqual(new Date(2026, 9, 7, 16, 15));
      expect(sessionsService.getSessions).toHaveBeenCalledTimes(1);
    });

    it('keeps 15 minutes when the times above give no length', () => {
      build({ endTime: undefined });
      c.onModeChange('after');
      expect(c['afterMinutes']).toBe(15);
    });

    it('reads again for another student', () => {
      build();
      c.onModeChange('after');
      fixture.componentRef.setInput('student', { id: 's-2', name: 'Sam' });
      fixture.detectChanges();
      expect(sessionsService.getSessions).toHaveBeenCalledTimes(2);
      expect(sessionsService.getSessions).toHaveBeenLastCalledWith('t-1', 's-2');
    });

    it('treats cleared or zero minutes as nothing to add', () => {
      sessionsService.getSessions.mockReturnValue(of([regular(7)]));
      build();
      c.onModeChange('after');
      sessionsService.createMakeupSet.mockClear();
      c.onAfterMinutesChange(null);
      expect(c['afterMinutes']).toBe(0);
      expect(sessionsService.createMakeupSet).not.toHaveBeenCalled();
      expect(el().querySelector('.repeat-empty')).not.toBeNull();
    });

    it('says so when the regular sessions cannot be loaded', () => {
      sessionsService.getSessions.mockReturnValue(throwError(() => new Error('boom')));
      build();
      c.onModeChange('after');
      expect(el().querySelector('.repeat-error')?.textContent)
        .toBe('The regular sessions could not be loaded. Please try again.');
      expect(sessionsService.createMakeupSet).not.toHaveBeenCalled();
    });

    it('shows the minutes field and the hint instead of the weekdays', () => {
      build();
      c.onModeChange('after');
      const html = el();
      expect(html.querySelector('.repeat-weekdays')).toBeNull();
      expect(html.querySelector('input[type=number]')).not.toBeNull();
      c.onModeChange('weekly');
      expect(el().querySelectorAll('.repeat-weekdays mat-checkbox')).toHaveLength(7);
    });
  });

  describe('save', () => {
    it('creates only the make-ups the preview accepted, with the notes', () => {
      sessionsService.createMakeupSet.mockReturnValue(of(plan({
        accepted: [0, 2],
        skipped: [{ index: 1, reason: 'insufficient' }],
      })));
      build();
      c.onModeChange('weekly');
      c.onUntilChange(new Date(2026, 9, 20));
      const previewed = lastRequest().sessions;
      const created = plan({ dry_run: false, created: 2, ids: ['a', 'b'], series_id: 'set-1' });
      sessionsService.createMakeupSet.mockReturnValue(of(created));
      let result: MakeupSetResult | undefined;
      c.save('Extra time').subscribe(r => (result = r));
      expect(result).toBe(created);
      const [request, dryRun] = sessionsService.createMakeupSet.mock.calls.at(-1)!;
      expect(dryRun).toBe(false);
      expect(request.notes).toBe('Extra time');
      expect(request.sessions).toEqual([previewed[0], previewed[2]]);
    });

    it('sends empty notes by default and nothing when there is no preview', () => {
      build();
      c.onModeChange('weekly');
      c.save().subscribe();
      expect(sessionsService.createMakeupSet.mock.calls.at(-1)![0].notes).toBe('');
      c.onModeChange('once');
      c.save().subscribe();
      expect(sessionsService.createMakeupSet.mock.calls.at(-1)![0].sessions).toEqual([]);
    });
  });

  describe('messageOf', () => {
    it('uses the reason the service gives, else the fallback', () => {
      expect(messageOf(new HttpErrorResponse({ status: 400, error: { message: 'Because.' } }), 'x')).toBe('Because.');
      expect(messageOf(new HttpErrorResponse({ status: 400, error: { message: ['a'] } }), 'x')).toBe('x');
      expect(messageOf(new HttpErrorResponse({ status: 500, error: { message: '' } }), 'x')).toBe('x');
      expect(messageOf(new HttpErrorResponse({ status: 0, error: null }), 'x')).toBe('x');
      expect(messageOf(undefined, 'x')).toBe('x');
    });
  });
});
