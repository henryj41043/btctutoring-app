import {Statement, StatementDue, StatementLine} from '../app/models/statement.model';

export const statementLine = (over: Partial<StatementLine> = {}): StatementLine => ({
  student_id: 's-1',
  student_name: 'Pat',
  kind: 'package',
  package: 'Succeed',
  from: '2026-07-01',
  to: '2026-07-31',
  sessions_billed: 4,
  sessions_in_month: 4,
  rate: 83.54,
  monthly_price: 362,
  amount: 362,
  discount_percent: 0,
  discount_amount: 0,
  net: 362,
  flags: [],
  ...over,
});

export const statementDue = (over: Partial<StatementDue> = {}): StatementDue => ({
  day: 1,
  period_start: '2026-07-01',
  derived: 362,
  override: null,
  amount: 362,
  paid: false,
  ...over,
});

/** A monthly family billed one full $362 month (July 2026). */
export const statement = (over: Partial<Statement> = {}): Statement => ({
  contact_id: 'c-1',
  contact_name: 'Casey Lee',
  month: '2026-07',
  cycle: 'monthly',
  lines: [statementLine()],
  package_gross: 362,
  package_subtotal: 362,
  sibling_discount_percent: 0,
  sibling_discount_amount: 0,
  group_fee: 0,
  group_students: [],
  total: 362,
  dues: [statementDue()],
  total_due: 362,
  flags: [],
  needs_attention: false,
  ...over,
});

/** The same family on the semi-monthly cycle: $181 on the 1st and the 15th. */
export const semiStatement = (over: Partial<Statement> = {}): Statement => statement({
  cycle: 'semi_monthly',
  dues: [
    statementDue({derived: 181, amount: 181}),
    statementDue({day: 15, period_start: '2026-07-15', derived: 181, amount: 181}),
  ],
  ...over,
});
