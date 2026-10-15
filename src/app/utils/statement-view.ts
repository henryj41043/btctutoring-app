import {BillingEntry, EntryDue} from '../models/billing-entry.model';
import {LineFlag, Statement, StatementDue, StatementLine} from '../models/statement.model';
import {BILLING_CYCLE_LABELS, BillingCycle} from '../enums/billing-cycle.enum';
import {round2} from './package-config';

/** What the office reads for each statement flag. */
export const FLAG_LABELS: Record<LineFlag, string> = {
  prorated_start: 'Prorated start',
  prorated_end: 'Prorated end',
  package_change: 'Package change',
  price_override: 'Custom price',
  discount: 'Discount',
  unpriced: 'Not priced',
  no_charge: 'No charge',
};

export function flagLabels(flags: LineFlag[] | undefined): string[] {
  return (flags ?? []).map(f => FLAG_LABELS[f]).filter(label => !!label);
}

export function formatMoney(value: number | undefined | null): string {
  return (value ?? 0).toLocaleString('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2,
  });
}

/** 'YYYY-MM-DD' rendered as e.g. 'Sep 14' (local wall date). */
export function shortDate(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

/** True when a line runs from the first to the last day of its month. */
/**
 * A line billed at the full monthly price: every scheduled session of the
 * month's window was billed. Since the straddling-weeks rule (2026-10-14)
 * a full month's days need not be the calendar month (October may run
 * Oct 4 to Oct 31), so the session counts decide; a line without counts
 * (no schedule, a legacy portion) falls back to the calendar dates.
 */
export function coversWholeMonth(line: StatementLine): boolean {
  if (line.kind === 'package' && line.sessions_in_month > 0) {
    return line.sessions_billed >= line.sessions_in_month;
  }
  const [y, m] = line.from.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return line.from.endsWith('-01') && line.to === `${line.from.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;
}

/** 'YYYY-MM' → its first and last day keys. */
function monthBounds(month: string): {first: string; last: string} {
  const [y, m] = month.split('-').map(Number);
  const lastDay = String(new Date(y, m, 0).getDate()).padStart(2, '0');
  return {first: `${month}-01`, last: `${month}-${lastDay}`};
}

/**
 * The days a line covers: 'Full month', 'From Sep 14', 'Through Sep 18' or
 * 'Sep 14 to Sep 20'. "From" and "Through" are read against the statement
 * month when given (a line may begin or end in a neighbouring month's days).
 */
export function linePeriod(line: StatementLine, month?: string): string {
  if (coversWholeMonth(line)) return 'Full month';
  const bounds = monthBounds(month ?? line.from.slice(0, 7));
  if (line.to === bounds.last) return `From ${shortDate(line.from)}`;
  if (line.from === bounds.first) return `Through ${shortDate(line.to)}`;
  return `${shortDate(line.from)} to ${shortDate(line.to)}`;
}

/** '3 of 4', or a dash when sessions were not counted (no schedule, legacy portion). */
export function lineSessions(line: StatementLine): string {
  if (line.kind !== 'package' || !line.sessions_in_month) return '—';
  return `${line.sessions_billed} of ${line.sessions_in_month}`;
}

/** One line as a sentence, e.g. 'Robbie: Succeed, from Sep 14, 3 of 4 sessions at $63.00'. */
export function lineSummary(line: StatementLine, month?: string): string {
  const parts: string[] = [`${line.student_name}: ${line.package}`];
  if (line.flags.includes('unpriced')) {
    parts.push('not priced');
    return parts.join(', ');
  }
  const period = linePeriod(line, month);
  // 'from Jul 14' reads as a clause; a range starting with a date keeps its case.
  parts.push(/^[A-Z][a-z]{2} \d/.test(period) ? period : period.charAt(0).toLowerCase() + period.slice(1));
  const sessions = lineSessions(line);
  if (sessions !== '—' && !coversWholeMonth(line)) {
    parts.push(`${sessions} sessions at ${formatMoney(line.rate)}`);
  }
  if (line.flags.includes('price_override')) {
    parts.push(`custom price ${formatMoney(line.monthly_price)}`);
  }
  if (line.discount_amount > 0) {
    parts.push(`less ${line.discount_percent}% (${formatMoney(line.discount_amount)})`);
  }
  return parts.join(', ');
}

/** The Students column: each student's package(s), then BTC & Me enrollments. */
export function statementPackages(statement: Statement): string {
  const seen: string[] = [];
  for (const line of statement.lines) {
    if (line.kind !== 'package') continue;
    const label = `${line.student_name}: ${line.package}`;
    if (!seen.includes(label)) seen.push(label);
  }
  for (const name of statement.group_students ?? []) {
    seen.push(`${name}: BTC & Me`);
  }
  return seen.join('; ');
}

/** The dues a cycle shows: monthly the 1st, semi-monthly the 1st and 15th, weekly every one. */
function duesOf(statement: Statement): StatementDue[] {
  if (statement.cycle === 'weekly') return statement.dues ?? [];
  const days = statement.cycle === 'semi_monthly' ? [1, 15] : [1];
  return days
    .map(day => (statement.dues ?? []).find(d => d.day === day))
    .filter((d): d is StatementDue => !!d);
}

/** One row due from a statement due (a blank half renders blank, not $0.00). */
export function toEntryDue(due: StatementDue, cycle: string): EntryDue {
  const derived = due.derived ? due.derived : null;
  const override = due.override ?? null;
  return {
    period_start: due.period_start,
    label: cycle === 'weekly' ? shortDate(due.period_start) : due.day === 15 ? '15th' : '1st',
    derived,
    override,
    amount: override ?? derived,
    paid: due.paid ?? false,
  };
}

/** The total of a row's dues (the overrides counted, blank halves as nothing). */
export function duesTotal(dues: EntryDue[]): number {
  return round2(dues.reduce((sum, d) => sum + (d.amount ?? 0), 0));
}

/** 'Monthly', 'Semi-monthly' or 'Weekly (Fri)' — the weekday read off the first due. */
export function cycleLabel(cycle: string | undefined, dues: EntryDue[] = []): string {
  if (cycle === BillingCycle.WEEKLY) {
    const first = dues[0]?.period_start;
    if (!first) return 'Weekly';
    const [y, m, d] = first.split('-').map(Number);
    return `Weekly (${new Date(y, m - 1, d).toLocaleDateString('en-US', {weekday: 'short'})})`;
  }
  return cycle === BillingCycle.SEMI_MONTHLY ? BILLING_CYCLE_LABELS[BillingCycle.SEMI_MONTHLY] : BILLING_CYCLE_LABELS[BillingCycle.MONTHLY];
}

/** Maps a service statement onto the Billing table row. */
export function toBillingEntry(statement: Statement): BillingEntry {
  const dues = duesOf(statement).map(due => toEntryDue(due, statement.cycle));
  const studentDiscount = statement.lines.reduce((sum, l) => sum + l.discount_amount, 0);
  const discount = round2(studentDiscount + statement.sibling_discount_amount);
  return {
    contact_id: statement.contact_id,
    name: statement.contact_name,
    packages: statementPackages(statement),
    cycle: statement.cycle,
    dues,
    total: duesTotal(dues),
    discount,
    discount_percent: studentDiscount > 0 ? 0 : statement.sibling_discount_percent,
    needs_attention: statement.needs_attention,
    labels: flagLabels(statement.flags),
    statement,
  };
}
