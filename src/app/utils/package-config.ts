import {Package} from '../enums/package.enum';

/**
 * The fixed definition of a tutoring package: a number of fixed-length sessions
 * per week at a flat monthly price. This replaces the old "available minutes"
 * bank — scheduling and billing now derive from these values.
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
 * Fixed package definitions. Monthly costs are the business's posted prices
 * (annualized over 52 weeks) and are authoritative — proration derives the
 * per-session and weekly rates from `monthlyCost`, never the other way round.
 *
 * `Package.CUSTOM` is intentionally absent: its values are entered per-student
 * and resolved via {@link resolvePackageDef}.
 */
export const PACKAGE_CONFIG: Record<Exclude<Package, Package.CUSTOM>, PackageDef> = {
  [Package.THRIVE]:        {monthlyCost: 181,  sessionsPerWeek: 1, sessionLengthMin: 30},
  [Package.EXCEL]:         {monthlyCost: 273,  sessionsPerWeek: 1, sessionLengthMin: 45},
  [Package.SUCCEED]:       {monthlyCost: 362,  sessionsPerWeek: 2, sessionLengthMin: 30},
  [Package.ACHIEVE]:       {monthlyCost: 546,  sessionsPerWeek: 3, sessionLengthMin: 30},
  [Package.VICTORY]:       {monthlyCost: 546,  sessionsPerWeek: 2, sessionLengthMin: 45},
  [Package.EMPOWER]:       {monthlyCost: 819,  sessionsPerWeek: 3, sessionLengthMin: 45},
  [Package.DETERMINATION]: {monthlyCost: 728,  sessionsPerWeek: 2, sessionLengthMin: 60},
  [Package.TRIUMPH]:       {monthlyCost: 728,  sessionsPerWeek: 4, sessionLengthMin: 30},
  [Package.POWER_UP]:      {monthlyCost: 1092, sessionsPerWeek: 3, sessionLengthMin: 60},
  [Package.CONQUEST]:      {monthlyCost: 1092, sessionsPerWeek: 4, sessionLengthMin: 45},
  [Package.SUMMIT]:        {monthlyCost: 1456, sessionsPerWeek: 4, sessionLengthMin: 60},
};

/** Round to the nearest penny. */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Resolves a package's definition. For CUSTOM, the per-student `override` must
 * supply all three values; returns null if a CUSTOM student hasn't been
 * configured yet.
 */
export function resolvePackageDef(
  pkg: Package | undefined,
  override?: Partial<PackageDef> | null,
): PackageDef | null {
  if (!pkg) return null;
  if (pkg === Package.CUSTOM) {
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
  return PACKAGE_CONFIG[pkg];
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
