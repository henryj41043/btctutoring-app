/**
 * A student's display name. Students can be created before the family has
 * shared a name (intake often starts from a parent's first email), so every
 * surface that renders a student name goes through this fallback. Nothing is
 * stored — the fallback is display-only.
 */
export function studentDisplayName(student?: { name?: string } | null): string {
  const name = student?.name?.trim();
  return name || 'Unnamed student';
}
