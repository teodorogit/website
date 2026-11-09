import { pickBestWeek, remainingCents, weekStartsEndingAt, zeroFillWeeks } from '../utils/weekly-sales.util';
import { mondaysFrom, week } from './utils/test.utils';

describe('weekly-sales.util', () => {
    describe('weekStartsEndingAt', () => {
        it('returns N Mondays oldest first, ending with the Monday of the week containing today', () => {
            // 2026-10-28 is a Wednesday.
            expect(weekStartsEndingAt('2026-10-28', 8)).toEqual(mondaysFrom('2026-09-07', 8));
        });

        it('treats Monday as the first day and Sunday as the last day of a week', () => {
            expect(weekStartsEndingAt('2026-10-26', 1)).toEqual(['2026-10-26']); // Monday
            expect(weekStartsEndingAt('2026-10-25', 1)).toEqual(['2026-10-19']); // Sunday
        });

        it('supports weeks=1 (only the current week)', () => {
            expect(weekStartsEndingAt('2026-11-05', 1)).toEqual(['2026-11-02']);
        });

        it('supports weeks=52, crossing a year boundary', () => {
            const starts = weekStartsEndingAt('2026-11-05', 52);

            expect(starts).toHaveLength(52);
            expect(starts[0]).toBe('2025-11-10');
            expect(starts[51]).toBe('2026-11-02');
            expect(starts).toEqual(mondaysFrom('2025-11-10', 52));
        });
    });

    describe('zeroFillWeeks', () => {
        it('keeps every requested week in order, with 0 for weeks without sales', () => {
            const starts = mondaysFrom('2026-10-12', 4);

            const filled = zeroFillWeeks(starts, [week('2026-10-19', 1500), week('2026-11-02', 300)]);

            expect(filled.map((w) => [w.week_start, w.week_end, w.total_cents])).toEqual([
                ['2026-10-12', '2026-10-18', 0],
                ['2026-10-19', '2026-10-25', 1500],
                ['2026-10-26', '2026-11-01', 0],
                ['2026-11-02', '2026-11-08', 300],
            ]);
        });

        it('returns all zeros when there are no totals', () => {
            expect(zeroFillWeeks(mondaysFrom('2026-10-26', 2), []).map((w) => w.total_cents)).toEqual([0, 0]);
        });

        it('ignores totals outside the window', () => {
            const filled = zeroFillWeeks(['2026-11-02'], [week('2026-10-26', 999), week('2026-11-02', 100)]);

            expect(filled.map((w) => w.total_cents)).toEqual([100]);
        });
    });

    describe('pickBestWeek', () => {
        it('returns the week with the highest total', () => {
            const weeks = [week('2026-10-19', 100), week('2026-10-26', 900), week('2026-11-02', 300)];

            expect(pickBestWeek(weeks)).toBe(weeks[1]);
        });

        it('breaks ties in favour of the earliest week', () => {
            const weeks = [week('2026-10-19', 100), week('2026-10-26', 900), week('2026-11-02', 900)];

            expect(pickBestWeek(weeks)?.week_start).toBe('2026-10-26');
        });

        it('returns null when every week is zero', () => {
            expect(pickBestWeek([week('2026-10-26', 0), week('2026-11-02', 0)])).toBeNull();
        });

        it('returns null for an empty list', () => {
            expect(pickBestWeek([])).toBeNull();
        });
    });

    describe('remainingCents', () => {
        it('is goal − sold while below the goal', () => {
            expect(remainingCents(100000, 45000)).toBe(55000);
        });

        it('never goes below zero when sold exceeds the goal', () => {
            expect(remainingCents(10000, 45000)).toBe(0);
        });

        it('is zero when there is no goal', () => {
            expect(remainingCents(null, 45000)).toBe(0);
        });
    });
});
