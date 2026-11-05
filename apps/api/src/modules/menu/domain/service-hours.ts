/** Minutes since midnight for "HH:MM". */
function minutesOf(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Whether a category with these service hours is served at `localTime`
 * ("HH:MM" in the hotel's time zone). Hours may run past midnight
 * (22:00–02:00). The start is inclusive, the end exclusive.
 */
export function isServedAt(availableFrom: string | null, availableUntil: string | null, localTime: string): boolean {
  if (!availableFrom || !availableUntil) return true;
  const from = minutesOf(availableFrom);
  const until = minutesOf(availableUntil);
  const now = minutesOf(localTime);
  if (from === until) return true;
  return from < until ? now >= from && now < until : now >= from || now < until;
}

/** "HH:MM" for `instant` in `timeZone`, e.g. "07:05" in Africa/Lagos. */
export function localTimeIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(instant);
  const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
  return `${hour}:${minute}`;
}
