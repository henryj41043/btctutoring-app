export enum Weekday {
  MONDAY = 'MONDAY',
  TUESDAY = 'TUESDAY',
  WEDNESDAY = 'WEDNESDAY',
  THURSDAY = 'THURSDAY',
  FRIDAY = 'FRIDAY',
  SATURDAY = 'SATURDAY',
  SUNDAY = 'SUNDAY',
}

/** Maps JavaScript Date.getDay() (0=Sunday) to the Weekday enum. */
export const WEEKDAY_BY_JS_DAY: Weekday[] = [
  Weekday.SUNDAY,
  Weekday.MONDAY,
  Weekday.TUESDAY,
  Weekday.WEDNESDAY,
  Weekday.THURSDAY,
  Weekday.FRIDAY,
  Weekday.SATURDAY,
];

/** Display label for a weekday (e.g. 'Mon'). */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
  [Weekday.MONDAY]: 'Mon',
  [Weekday.TUESDAY]: 'Tue',
  [Weekday.WEDNESDAY]: 'Wed',
  [Weekday.THURSDAY]: 'Thu',
  [Weekday.FRIDAY]: 'Fri',
  [Weekday.SATURDAY]: 'Sat',
  [Weekday.SUNDAY]: 'Sun',
};
