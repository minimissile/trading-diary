export type LhbCalendarPeriod = 'day' | 'week' | 'month' | 'quarter';
const DAY = 86_400_000;
const iso = (value: Date) => value.toISOString().slice(0, 10);
export function lhbCalendarRange(date: string, period: LhbCalendarPeriod): { startDate: string; endDate: string } {
  const start = new Date(`${date}T00:00:00Z`);
  const end = new Date(start);
  if (period === 'week') {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    end.setTime(start.getTime() + 6 * DAY);
  } else if (period === 'month' || period === 'quarter') {
    const month = period === 'quarter' ? Math.floor(start.getUTCMonth() / 3) * 3 : start.getUTCMonth();
    start.setUTCMonth(month, 1);
    end.setUTCFullYear(start.getUTCFullYear(), month + (period === 'quarter' ? 3 : 1), 0);
  }
  return { startDate: iso(start), endDate: iso(end) };
}
export function shiftLhbCalendar(date: string, period: LhbCalendarPeriod, direction: -1 | 1): string {
  const start = new Date(`${lhbCalendarRange(date, period).startDate}T00:00:00Z`);
  if (period === 'day' || period === 'week') start.setUTCDate(start.getUTCDate() + direction * (period === 'week' ? 7 : 1));
  else start.setUTCMonth(start.getUTCMonth() + direction * (period === 'quarter' ? 3 : 1));
  return iso(start);
}
