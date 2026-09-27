import {BillingEntry} from '../models/billing-entry.model';
import {LineFlag, Statement, StatementLine} from '../models/statement.model';
import {round2} from './package-config';

/** What the office reads for each statement flag. */
export const FLAG_LABELS: Record<LineFlag, string> = {
  prorated_start: 'Prorated start',
  prorated_end: 'Prorated end',
  package_change: 'Package change',
  price_override: 'Custom price',
  discount: 'Discount',
  unpriced: 'Not priced',
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
export function coversWholeMonth(line: StatementLine): boolean {
  const [y, m] = line.from.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return line.from.endsWith('-01') && line.to === `${line.from.slice(0, 8)}${String(lastDay).padStart(2, '0')}`;
}

/** The days a line covers: 'Full month', 'From Sep 14', 'Through Sep 18' or 'Sep 14 to Sep 20'. */
export function linePeriod(line: StatementLine): string {
  if (coversWholeMonth(line)) return 'Full month';
  const [y, m] = line.from.split('-').map(Number);
  const lastDay = String(new Date(y, m, 0).getDate()).padStart(2, '0');
  if (line.to.endsWith(`-${lastDay}`)) return `From ${shortDate(line.from)}`;
  if (line.from.endsWith('-01')) return `Through ${shortDate(line.to)}`;
  return `${shortDate(line.from)} to ${shortDate(line.to)}`;
}

/** '3 of 4', or a dash when sessions were not counted (no schedule, legacy portion). */
export function lineSessions(line: StatementLine): string {
  if (line.kind !== 'package' || !line.sessions_in_month) return '—';
  return `${line.sessions_billed} of ${line.sessions_in_month}`;
}

/** One line as a sentence, e.g. 'Robbie: Succeed, from Sep 14, 3 of 4 sessions at $63.00'. */
export function lineSummary(line: StatementLine): string {
  const parts: string[] = [`${line.student_name}: ${line.package}`];
  if (line.flags.includes('unpriced')) {
    parts.push('not priced');
    return parts.join(', ');
  }
  const period = linePeriod(line);
  parts.push(period.charAt(0).toLowerCase() + period.slice(1));
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

/** Maps a service statement onto the Billing table row. */
export function toBillingEntry(statement: Statement): BillingEntry {
  const semi = statement.cycle === 'semi_monthly';
  const first = statement.dues.find(d => d.day === 1);
  const fifteenth = semi ? statement.dues.find(d => d.day === 15) : undefined;
  // A half with no charge (the blank side of a prorated month) renders blank, not $0.00.
  const blank = (value: number | undefined): number | null => (value ? value : null);
  const derivedFirst = blank(first?.derived);
  const derivedFifteenth = blank(fifteenth?.derived);
  const overrideFirst = first?.override ?? null;
  const overrideFifteenth = fifteenth?.override ?? null;
  const dueFirst = overrideFirst ?? derivedFirst;
  const dueFifteenth = overrideFifteenth ?? derivedFifteenth;
  const studentDiscount = statement.lines.reduce((sum, l) => sum + l.discount_amount, 0);
  const discount = round2(studentDiscount + statement.sibling_discount_amount);
  return {
    contact_id: statement.contact_id,
    name: statement.contact_name,
    packages: statementPackages(statement),
    cycle: statement.cycle,
    due_first: dueFirst,
    due_fifteenth: dueFifteenth,
    derived_first: derivedFirst,
    derived_fifteenth: derivedFifteenth,
    override_first: overrideFirst,
    override_fifteenth: overrideFifteenth,
    total: round2((dueFirst ?? 0) + (dueFifteenth ?? 0)),
    discount,
    discount_percent: studentDiscount > 0 ? 0 : statement.sibling_discount_percent,
    paid_first: first?.paid ?? false,
    paid_fifteenth: fifteenth?.paid ?? false,
    needs_attention: statement.needs_attention,
    labels: flagLabels(statement.flags),
    statement,
  };
}
