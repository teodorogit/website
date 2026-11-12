import {
    addDays,
    compareCalendarDates,
    daysBetween,
    isCalendarDate,
    isoWeekdayOf,
    isValidTimeZone,
    localDateRange,
    localDateTimeToInstant,
    mondayOf,
    monthDateRange,
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

    describe('range ending on the last accepted day', () => {
        it('resolves the exclusive end 9999-01-01 instead of throwing (GET /api/sales?endDate=9998-12-31 was a 500)', () => {
            expect(localDateRange('9998-01-01', '9998-12-31', SP)).toEqual({
                start: new Date('9998-01-01T03:00:00.000Z'),
                end: new Date('9999-01-01T03:00:00.000Z'),
            });
            expect(addDays('9998-12-31', 1)).toBe('9999-01-01');
        });

        it('keeps rejecting 9999 as an input date and anything that is not a real date', () => {
            expect(isCalendarDate('9999-01-01')).toBe(false);
            expect(() => startOfLocalDay('2026-02-30', SP)).toThrow(RangeError);
            expect(() => startOfLocalDay('10000-01-01', SP)).toThrow(RangeError);
        });
    });

    describe('isoWeekdayOf', () => {
        it.each([
            ['2026-11-02', 1], // Monday
            ['2026-11-05', 4],
            ['2026-11-07', 6],
            ['2026-11-08', 7], // Sunday is 7, not JavaScript's 0
            ['2024-02-29', 4],
        ])('%s is ISO weekday %i', (date, weekday) => {
            expect(isoWeekdayOf(date)).toBe(weekday);
        });
    });

    describe('daysBetween', () => {
        it('counts whole days across month and year ends', () => {
            expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
            expect(daysBetween('2026-11-05', '2026-11-05')).toBe(0);
            expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
            expect(daysBetween('2026-01-01', '2026-12-31')).toBe(364);
            expect(daysBetween('2026-11-05', '2026-11-01')).toBe(-4);
        });
    });

    describe('monthDateRange', () => {
        it.each([
            [2026, 1, '2026-01-01', '2026-01-31'],
            [2026, 2, '2026-02-01', '2026-02-28'],
            [2028, 2, '2028-02-01', '2028-02-29'], // leap year
            [2100, 2, '2100-02-01', '2100-02-28'], // divisible by 100, not by 400
            [2026, 11, '2026-11-01', '2026-11-30'],
            [9998, 12, '9998-12-01', '9998-12-31'],
        ])('%i-%i is %s..%s', (year, month, from, to) => {
            expect(monthDateRange(year, month)).toEqual({ from, to });
        });
    });

    it('validates IANA timezones', () => {
        expect(isValidTimeZone(SP)).toBe(true);
        expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    });
});
