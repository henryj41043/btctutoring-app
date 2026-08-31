import {effectiveSlotTutorId, groupSlotsByEffectiveTutor, studentVisibleToTutor} from './slot-tutor';
import {ScheduleSlot} from './proration';
import {Student} from '../models/student.model';
import {Weekday} from '../enums/weekday.enum';

const slot = (over: Partial<ScheduleSlot> = {}): ScheduleSlot => ({
  weekday: Weekday.MONDAY,
  start_time: '10:00',
  end_time: '10:30',
  ...over,
});
const student = (over: Partial<Student> = {}): Student => ({
  id: 's-1',
  assigned_tutor_id: 't-primary',
  ...over,
});

describe('effectiveSlotTutorId', () => {
  it('prefers the slot override', () => {
    expect(effectiveSlotTutorId(slot({tutor_id: 't-2'}), student())).toBe('t-2');
  });

  it('falls back to the assigned tutor when absent or empty', () => {
    expect(effectiveSlotTutorId(slot(), student())).toBe('t-primary');
    expect(effectiveSlotTutorId(slot({tutor_id: ''}), student())).toBe('t-primary');
  });

  it('is undefined when neither exists', () => {
    expect(effectiveSlotTutorId(slot(), student({assigned_tutor_id: undefined}))).toBeUndefined();
    expect(effectiveSlotTutorId(slot({tutor_id: ''}), student({assigned_tutor_id: ''}))).toBeUndefined();
  });
});

describe('studentVisibleToTutor', () => {
  it('matches the primary tutor', () => {
    expect(studentVisibleToTutor(student(), 't-primary')).toBe(true);
  });

  it('matches any slot tutor', () => {
    const s = student({schedule: [slot(), slot({weekday: Weekday.WEDNESDAY, tutor_id: 't-2'})]});
    expect(studentVisibleToTutor(s, 't-2')).toBe(true);
  });

  it('rejects tutors on neither, and slots without overrides never match', () => {
    const s = student({schedule: [slot()]});
    expect(studentVisibleToTutor(s, 't-else')).toBe(false);
  });

  it('handles missing schedule, malformed slots, and missing tutor id', () => {
    expect(studentVisibleToTutor(student(), undefined)).toBe(false);
    expect(studentVisibleToTutor(student({schedule: [undefined as never]}), 't-2')).toBe(false);
    expect(studentVisibleToTutor(student({assigned_tutor_id: undefined}), 't-primary')).toBe(false);
  });
});

describe('groupSlotsByEffectiveTutor', () => {
  it('groups by effective tutor, primary fallback included', () => {
    const slots = [
      slot(),
      slot({weekday: Weekday.WEDNESDAY, tutor_id: 't-2'}),
      slot({weekday: Weekday.FRIDAY}),
    ];
    const groups = groupSlotsByEffectiveTutor(slots, student());
    expect([...groups.keys()]).toEqual(['t-primary', 't-2']);
    expect(groups.get('t-primary')).toHaveLength(2);
    expect(groups.get('t-2')).toHaveLength(1);
  });

  it('all-default slots form a single primary group', () => {
    const groups = groupSlotsByEffectiveTutor([slot(), slot()], student());
    expect(groups.size).toBe(1);
    expect(groups.get('t-primary')).toHaveLength(2);
  });

  it('no resolvable tutor groups under the empty key', () => {
    const groups = groupSlotsByEffectiveTutor([slot()], student({assigned_tutor_id: undefined}));
    expect([...groups.keys()]).toEqual(['']);
  });

  it('is empty for no slots', () => {
    expect(groupSlotsByEffectiveTutor([], student()).size).toBe(0);
  });
});
