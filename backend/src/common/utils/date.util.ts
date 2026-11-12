import { TZDate } from '@date-fns/tz';

/**
 * Calendar dates (`YYYY-MM-DD`) are wall-calendar values in the *user's* timezone
 * (default `America/Sao_Paulo`, BACKEND_SCOPE.md §1); persisted instants are `timestamptz`.
 * Never use the server's local timezone (`new Date().getDate()`, `setHours`, …) for either.
 *
 * Calendar arithmetic (add days, Monday of week) runs on UTC-midnight Dates, which have no DST,
 * and only the final local-date ↔ instant step consults the timezone.
 */

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Latest accepted year, so that `addDays(date, 1)` always stays a valid calendar date. */
export const MAX_CALENDAR_YEAR = 9998;

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

export type TimeOfDay = {
    hours: number;
    minutes: number;
    seconds: number;
    milliseconds: number;
};

type CalendarDateParts = { year: number; month: number; day: number };

/** Parts of a real date written as `YYYY-MM-DD`, whatever its year; null for anything else. */
function realDateParts(value: string): CalendarDateParts | null {
    const match = CALENDAR_DATE_PATTERN.exec(value);
    if (!match) {
        return null;
    }

    const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    const date = new Date(Date.UTC(year, month - 1, day));

    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
        ? { year, month, day }
        : null;
}

/** True only for a real calendar date in `YYYY-MM-DD` (rejects `2026-02-30`, `2026-2-3`, `20260203`). */
export function isCalendarDate(value: unknown): value is string {
    if (typeof value !== 'string') {
        return false;
    }

    // Ranges are half-open and end at the next day's start; for 9999-12-31 that day (10000-01-01)
    // has no YYYY-MM-DD form, which made GET /api/sales?endDate=9999-12-31 a 500.
    const parts = realDateParts(value);
    return parts !== null && parts.year <= MAX_CALENDAR_YEAR;
}

function parseCalendarDate(date: string): CalendarDateParts {
    // Deliberately not `isCalendarDate`: the exclusive end of a range that stops on the last accepted
    // day (MAX_CALENDAR_YEAR-12-31) is 9999-01-01, and it must still resolve to an instant.
    const parts = realDateParts(date);
    if (!parts) {
        throw new RangeError(`Invalid calendar date: ${date}`);
    }

    return parts;
}

function utcMidnight(date: string): Date {
    const { year, month, day } = parseCalendarDate(date);
    return new Date(Date.UTC(year, month - 1, day));
}

function formatUtcMidnight(date: Date): string {
    return date.toISOString().slice(0, 10);
}

/** `addDays('2026-10-31', 1) === '2026-11-01'`. Pure calendar math, timezone-free. */
export function addDays(date: string, days: number): string {
    return formatUtcMidnight(new Date(utcMidnight(date).getTime() + days * DAY_MS));
}

/** Monday of the week containing `date` (weeks start on Monday, BACKEND_SCOPE.md §2 Dashboard). */
export function mondayOf(date: string): string {
    const weekday = utcMidnight(date).getUTCDay(); // 0 = Sunday
    return addDays(date, -((weekday + 6) % 7));
}

/** ISO 8601 weekday of a calendar date: 1 = Monday … 7 = Sunday (not JavaScript's `getDay()`). */
export function isoWeekdayOf(date: string): number {
    return ((utcMidnight(date).getUTCDay() + 6) % 7) + 1;
}

/** Whole days from `from` to `to` (`daysBetween('2026-10-31', '2026-11-02') === 2`); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
    return Math.round((utcMidnight(to).getTime() - utcMidnight(from).getTime()) / DAY_MS);
}

/** First and last calendar date of `month` (1–12) of `year`, leap years included. */
export function monthDateRange(year: number, month: number): { from: string; to: string } {
    // Day 0 of the next month is the last day of this one.
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

    return { from: `${prefix}-01`, to: `${prefix}-${String(lastDay).padStart(2, '0')}` };
}

/** Lexicographic compare works for `YYYY-MM-DD`; returns <0, 0, >0. */
export function compareCalendarDates(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

/** Calendar date of `instant` as seen in `timeZone`. */
export function toLocalDate(instant: Date, timeZone: string): string {
    const local = new TZDate(instant.getTime(), timeZone);
    const year = String(local.getFullYear()).padStart(4, '0');
    const month = String(local.getMonth() + 1).padStart(2, '0');
    const day = String(local.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
}

/** Wall-clock `HH:mm` of `instant` in `timeZone` (the `time` field of a sale). */
export function toLocalTime(instant: Date, timeZone: string): string {
    const local = new TZDate(instant.getTime(), timeZone);
    return `${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
}

/** Wall-clock time of day of `instant` in `timeZone`. */
export function toLocalTimeOfDay(instant: Date, timeZone: string): TimeOfDay {
    const local = new TZDate(instant.getTime(), timeZone);

    return {
        hours: local.getHours(),
        minutes: local.getMinutes(),
        seconds: local.getSeconds(),
        milliseconds: local.getMilliseconds(),
    };
}

/** "Today" in `timeZone`. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
    return toLocalDate(now, timeZone);
}

/** The instant at which the wall clock in `timeZone` shows `date` + `time`. */
export function localDateTimeToInstant(date: string, time: TimeOfDay, timeZone: string): Date {
    const { year, month, day } = parseCalendarDate(date);
    const local = new TZDate(year, month - 1, day, time.hours, time.minutes, time.seconds, time.milliseconds, timeZone);

    return new Date(local.getTime());
}

/** First instant of `date` in `timeZone`. */
export function startOfLocalDay(date: string, timeZone: string): Date {
    return localDateTimeToInstant(date, { hours: 0, minutes: 0, seconds: 0, milliseconds: 0 }, timeZone);
}

/**
 * Half-open instant range `[start, end)` covering the calendar dates `from`..`to` (both inclusive)
 * in `timeZone`. Use `gte: start, lt: end` in queries — never `lte` an end-of-day timestamp.
 */
export function localDateRange(from: string, to: string, timeZone: string): { start: Date; end: Date } {
    return {
        start: startOfLocalDay(from, timeZone),
        end: startOfLocalDay(addDays(to, 1), timeZone),
    };
}

/** Is `timeZone` an IANA zone this runtime understands? */
export function isValidTimeZone(timeZone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone });
        return true;
    } catch {
        return false;
    }
}
