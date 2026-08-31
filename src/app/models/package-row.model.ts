/**
 * One row of the admin-managed package catalog. `id` IS the package name
 * (the string persisted on students), so it is permanent: rows are immutable
 * after create except the `retired` flag.
 */
export interface PackageRow {
  id?: string;
  monthlyCost?: number;
  sessionsPerWeek?: number;
  sessionLengthMin?: number;
  retired?: boolean;
  created_at?: string;
  updated_at?: string;
}
