import {
    addDays,
    compareCalendarDates,
    isCalendarDate,
    isValidTimeZone,
    localDateRange,
    localDateTimeToInstant,
    mondayOf,
    startOfLocalDay,
    toLocalDate,
    toLocalTime,
    toLocalTimeOfDay,
    todayIn,
} from '../date.util';

const SP = 'America/Sao_Paulo';

describe('date.util', () => {
    it('runs under a non-São Paulo server timezone (guards against local-time leaks)', () => {
        expect(process.env['TZ']).toBe('Asia/Tokyo');
    });

    describe('isCalendarDate', () => {
        it.each(['2026-10-24', '2024-02-29', '2026-12-31', '2026-01-01', '9998-12-31'])('accepts %s', (value) => {
            expect(isCalendarDate(value)).toBe(true);
        });

        it.each([
            '2026-02-29',
            '9999-12-31', // its next day has no YYYY-MM-DD form
            '2026-02-30',
            '2026-13-01',
            '2026-00-10',
            '2026-1-01',
            '20261024',
            '2026-10-24T00:00:00Z',
            ' 2026-10-24',
            '',
            null,
            20261024,
        ])('rejects %p', (value) => {
            expect(isCalendarDate(value)).toBe(false);
        });
    });

    describe('calendar arithmetic', () => {
        it('adds days across month and year boundaries', () => {
            expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
            expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
            expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
            expect(addDays('2026-10-24', -49)).toBe('2026-09-05');
        });

        it('finds the Monday of the week (weeks start on Monday)', () => {
            expect(mondayOf('2026-10-26')).toBe('2026-10-26'); // Monday
            expect(mondayOf('2026-10-28')).toBe('2026-10-26'); // Wednesday
            expect(mondayOf('2026-11-01')).toBe('2026-10-26'); // Sunday belongs to the previous Monday
            expect(mondayOf('2027-01-03')).toBe('2026-12-28'); // across the year boundary
        });

        it('compares dates', () => {
            expect(compareCalendarDates('2026-01-02', '2026-01-10')).toBeLessThan(0);
            expect(compareCalendarDates('2026-01-10', '2026-01-10')).toBe(0);
            expect(compareCalendarDates('2026-02-01', '2026-01-31')).toBeGreaterThan(0);
        });
    });

    describe('instant ↔ local date/time', () => {
        it('reads the calendar date in the user timezone, not UTC or server time', () => {
            // 01:30 UTC on Oct 25 is still Oct 24 (22:30) in São Paulo (UTC-3)
            const instant = new Date('2026-10-25T01:30:00.000Z');

            expect(toLocalDate(instant, SP)).toBe('2026-10-24');
            expect(toLocalTime(instant, SP)).toBe('22:30');
            expect(toLocalDate(instant, 'UTC')).toBe('2026-10-25');
        });

        it('builds the instant for a wall-clock time in the user timezone', () => {
            const instant = localDateTimeToInstant(
                '2026-10-24',
                { hours: 12, minutes: 30, seconds: 0, milliseconds: 0 },
                SP,
            );

            expect(instant.toISOString()).toBe('2026-10-24T15:30:00.000Z');
        });

        it('round-trips time of day', () => {
            const instant = new Date('2026-10-24T15:30:45.123Z');
            const time = toLocalTimeOfDay(instant, SP);

            expect(time).toEqual({ hours: 12, minutes: 30, seconds: 45, milliseconds: 123 });
            expect(localDateTimeToInstant(toLocalDate(instant, SP), time, SP).getTime()).toBe(instant.getTime());
        });

        it('computes start of local day and half-open ranges', () => {
            expect(startOfLocalDay('2026-10-24', SP).toISOString()).toBe('2026-10-24T03:00:00.000Z');

            const { start, end } = localDateRange('2026-10-20', '2026-10-24', SP);
            expect(start.toISOString()).toBe('2026-10-20T03:00:00.000Z');
            expect(end.toISOString()).toBe('2026-10-25T03:00:00.000Z');
        });

        it('handles DST zones (the local day can be 23h long)', () => {
            // New York springs forward on 2026-03-08
            const { start, end } = localDateRange('2026-03-08', '2026-03-08', 'America/New_York');
            expect(end.getTime() - start.getTime()).toBe(23 * 60 * 60 * 1000);
        });

        it('todayIn uses the given timezone', () => {
            const now = new Date('2026-10-25T01:30:00.000Z');
            expect(todayIn(SP, now)).toBe('2026-10-24');
            expect(todayIn('Asia/Tokyo', now)).toBe('2026-10-25');
        });
    });

    it('validates IANA timezones', () => {
        expect(isValidTimeZone(SP)).toBe(true);
        expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    });
});
