import {Student} from '../models/student.model';

/**
 * The extra planning minutes a tutor earns per counted session with a
 * student: the tutor's per-tutor override when one exists, else the
 * student's default (default + overrides model — a student with several
 * tutors can credit each differently).
 */
export function extraPlanningMinutesFor(
  student: Student,
  tutorId: string | undefined,
): number {
  const override = tutorId
    ? (student.extra_planning_by_tutor ?? []).find(o => o?.tutor_id === tutorId)
    : undefined;
  return override?.minutes ?? student.extra_planning_minutes ?? 0;
}
