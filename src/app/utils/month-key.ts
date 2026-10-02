/** 'YYYY-MM' for the month a date falls in (local time). */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
}

/** The next `count` months after the one `now` falls in, soonest first. */
export function upcomingMonthKeys(now: Date, count: number): string[] {
  const keys: string[] = [];
  for (let ahead = 1; ahead <= count; ahead++) {
    keys.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() + ahead, 1)));
  }
  return keys;
}
