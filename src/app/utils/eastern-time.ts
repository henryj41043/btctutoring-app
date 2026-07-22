/**
 * Explicit America/New_York wall-time → UTC conversion (mirror of the backend
 * util in btctutoring-service/src/billing/eastern-time.ts — keep in sync).
 *
 * Schedule slots store Eastern wall times ('HH:mm'). Pinning the conversion to
 * Eastern makes generated session instants independent of the machine's ambient
 * timezone — the browser of a traveling admin and the UTC backend cron all
 * produce identical ISO strings for the same slot.
 */

const EASTERN_TZ = 'America/New_York';

const easternParts = new Intl.DateTimeFormat('en-US', {
  timeZone: EASTERN_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

/** The Eastern-zone UTC offset (ms) in effect at the given instant (negative for EST/EDT). */
function easternOffsetMs(at: Date): number {
  const parts = easternParts.formatToParts(at);
  const get = (type: string): number =>
    Number(parts.find(p => p.type === type)?.value ?? '0');
  // Some ICU builds render midnight as hour '24' with hour12:false.
  const wall = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') % 24,
    get('minute'),
    get('second'),
  );
  return wall - at.getTime();
}

/**
 * The UTC instant at which an Eastern wall clock reads the given local time.
 * `month` is 0-indexed. The second offset pass settles DST-transition edges.
 */
export function easternWallTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  const asUtc = Date.UTC(year, month, day, hour, minute, 0, 0);
  let offset = easternOffsetMs(new Date(asUtc));
  offset = easternOffsetMs(new Date(asUtc - offset));
  return new Date(asUtc - offset);
}

/** The UTC instant for a schedule slot time ('HH:mm', Eastern) on a calendar date. */
export function easternSlotToUtc(
  year: number,
  month: number,
  day: number,
  time: string,
): Date {
  const [h, m] = (time ?? '').split(':').map(Number);
  return easternWallTimeToUtc(year, month, day, h || 0, m || 0);
}
