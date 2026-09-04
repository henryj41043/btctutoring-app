import {extraPlanningMinutesFor} from './planning';
import {Student} from '../models/student.model';

const student = (over: Partial<Student> = {}): Student =>
  ({
    id: 's-1',
    extra_planning_minutes: 10,
    extra_planning_by_tutor: [
      {tutor_id: 't-spanish', minutes: 25},
      {tutor_id: 't-zero', minutes: 0},
    ],
    ...over,
  }) as Student;

describe('extraPlanningMinutesFor', () => {
  it('an override wins for its tutor; other tutors get the default', () => {
    expect(extraPlanningMinutesFor(student(), 't-spanish')).toBe(25);
    expect(extraPlanningMinutesFor(student(), 't-math')).toBe(10);
  });

  it('a zero override is a real override, not a fallback to the default', () => {
    expect(extraPlanningMinutesFor(student(), 't-zero')).toBe(0);
  });

  it('no overrides at all falls back to the default, then 0', () => {
    expect(extraPlanningMinutesFor(student({extra_planning_by_tutor: undefined}), 't-1')).toBe(10);
    expect(extraPlanningMinutesFor(
      student({extra_planning_by_tutor: undefined, extra_planning_minutes: undefined}), 't-1')).toBe(0);
  });

  it('an undefined tutor id never matches an override', () => {
    expect(extraPlanningMinutesFor(student(), undefined)).toBe(10);
  });

  it('tolerates malformed override entries', () => {
    expect(extraPlanningMinutesFor(
      student({extra_planning_by_tutor: [null, {tutor_id: 't-a', minutes: 5}] as never}), 't-a')).toBe(5);
  });
});
