import {Weekday} from '../enums/weekday.enum';

/**
 * A weekly availability block: a single time range that applies to one or more
 * days of the week. Times are 24h "HH:mm" strings (e.g. "13:00").
 * Example: { days: [MONDAY, WEDNESDAY, FRIDAY], start_time: "13:00", end_time: "17:00" }
 */
export interface AvailabilityBlock {
  days: Weekday[];
  start_time: string;
  end_time: string;
}
