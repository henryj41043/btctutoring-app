import {PackageRow} from '../models/package-row.model';

/**
 * Package definitions resolve from the admin-managed catalog (the service's
 * Packages table via PackageService) — no more hardcoded config. Pages and
 * dialogs fetch the catalog in ngOnInit and thread it through these pure
 * helpers. Mirror of the backend helpers
 * (btctutoring-service/src/billing/package-config.ts). Keep the two in sync.
 */

/**
 * The one package that never lives in the catalog: a code-level marker for
 * per-student overrides (custom_monthly_cost / custom_sessions_per_week /
 * custom_session_length_min).
 */
export const CUSTOM_PACKAGE = 'Custom';

/**
 * The fixed definition of a tutoring package: a number of fixed-length sessions
 * per week at a flat monthly price.
 */
export interface PackageDef {
  /** Flat monthly price for a full month (USD). */
  monthlyCost: number;
  /** Number of tutoring sessions per week. */
  sessionsPerWeek: number;
  /** Length of each session in minutes. */
  sessionLengthMin: number;
}

/**
 * Package name → definition, built from the Packages table. Retired entries
 * are INCLUDED — they keep resolving for students still on them; `retired`
 * only governs whether a package is offered for NEW selections.
 */
export type PackageCatalog = Record<string, PackageDef & {retired?: boolean}>;

/** Folds the fetched catalog rows into a name-keyed map (retired included). */
export function toCatalog(rows: PackageRow[]): PackageCatalog {
  const catalog: PackageCatalog = {};
  for (const row of rows) {
    if (!row.id) continue;
    catalog[row.id] = {
      monthlyCost: row.monthlyCost ?? 0,
      sessionsPerWeek: row.sessionsPerWeek ?? 0,
      sessionLengthMin: row.sessionLengthMin ?? 0,
      retired: !!row.retired,
    };
  }
  return catalog;
}

/**
 * The names to offer in a package select: active packages ascending by monthly
 * cost, then 'Custom', then any currently-stored value (a retired package)
 * appended if missing — so an open form never blanks an existing selection.
 */
export function packageSelectOptions(
  catalog: PackageCatalog,
  currentValues: (string | undefined)[] = [],
): string[] {
  const active = Object.entries(catalog)
    .filter(([, def]) => !def.retired)
    .sort(([, a], [, b]) => a.monthlyCost - b.monthlyCost)
    .map(([name]) => name);
  const options = [...active, CUSTOM_PACKAGE];
  for (const value of currentValues) {
    if (value && !options.includes(value)) {
      options.push(value);
    }
  }
  return options;
}

/** Round to the nearest penny. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolves a package's definition from the catalog. For CUSTOM, the
 * per-student `override` must supply all three values; returns null if a
 * CUSTOM student hasn't been configured yet, or the name isn't in the catalog.
 */
export function resolvePackageDef(
  pkg: string | undefined,
  catalog: PackageCatalog,
  override?: Partial<PackageDef> | null,
): PackageDef | null {
  if (!pkg) return null;
  if (pkg === CUSTOM_PACKAGE) {
    if (
      override &&
      override.monthlyCost != null &&
      override.sessionsPerWeek != null &&
      override.sessionLengthMin != null
    ) {
      return override as PackageDef;
    }
    return null;
  }
  const entry = catalog[pkg];
  if (!entry) return null;
  return {
    monthlyCost: entry.monthlyCost,
    sessionsPerWeek: entry.sessionsPerWeek,
    sessionLengthMin: entry.sessionLengthMin,
  };
}

/**
 * Per-week cost, annualized over 52 weeks and rounded to the penny.
 * e.g. Succeed: round(362 * 12 / 52, 2) = $83.54.
 */
export function weeklyCost(def: PackageDef): number {
  return round2((def.monthlyCost * 12) / 52);
}

/**
 * Per-session cost: the weekly cost split across the package's weekly sessions,
 * rounded to the penny. e.g. Succeed: round(83.54 / 2, 2) = $41.77.
 */
export function perSessionCost(def: PackageDef): number {
  return round2(weeklyCost(def) / def.sessionsPerWeek);
}
