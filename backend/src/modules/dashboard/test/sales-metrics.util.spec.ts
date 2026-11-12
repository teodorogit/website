import { addDays, isoWeekdayOf } from '@/common/utils/date.util';
import { DailySalesTotal } from '../entities/daily-sales-total.entity';
import {
    averageCents,
    buildDashboardMetrics,
    daysWithin,
    metricsPeriod,
    monthlyProfit,
    pickBestAverage,
    salesByWeekOfMonth,
    salesByWeekday,
    sumPeriod,
    weekOfMonthOf,
    weekdayOccurrences,
    yearOf,
} from '../utils/sales-metrics.util';
import { day, productSales } from './utils/test.utils';

/**
 * A Thursday-to-Saturday seller whose first sale is on 2026-10-01 and last on 2026-11-12: R$ 500 per
 * block of the month, except days 22–28 with R$ 700. Block 1 has happened twice, the later ones once.
 */
const THU_TO_SAT_SELLER: DailySalesTotal[] = [
    // October, block 1 (days 1–7): 500
    day('2026-10-01', 20000),
    day('2026-10-02', 15000),
    day('2026-10-03', 15000),
    // block 2 (8–14): 500
    day('2026-10-08', 20000),
    day('2026-10-09', 15000),
    day('2026-10-10', 15000),
    // block 3 (15–21): 500
    day('2026-10-15', 20000),
    day('2026-10-16', 15000),
    day('2026-10-17', 15000),
    // block 4 (22–28): 700
    day('2026-10-22', 30000),
    day('2026-10-23', 20000),
    day('2026-10-24', 20000),
    // block 5 (29–31): 500
    day('2026-10-29', 20000),
    day('2026-10-30', 15000),
    day('2026-10-31', 15000),
    // November, block 1: 500
    day('2026-11-05', 20000),
    day('2026-11-06', 15000),
    day('2026-11-07', 15000),
    // block 2, in progress: 100
    day('2026-11-12', 10000),
];

/**
 * A Monday-to-Saturday seller on every selling day of October 2026, a month with five Thursdays,
 * Fridays and Saturdays and four of each other weekday: R$ 300 on Mondays, 290 on Saturdays,
 * 280 on Fridays and 250 on the other days.
 */
const OCTOBER_MON_TO_SAT_SELLER: DailySalesTotal[] = Array.from({ length: 31 }, (_, index) =>
    addDays('2026-10-01', index),
)
    .filter((date) => isoWeekdayOf(date) !== 7)
    .map((date) => day(date, { 1: 30000, 5: 28000, 6: 29000 }[isoWeekdayOf(date)] ?? 25000));

describe('sales-metrics.util', () => {
    describe('metricsPeriod', () => {
        it('is the whole year without a month', () => {
            expect(metricsPeriod(2026)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
        });

        it.each([
            [2026, 2, '2026-02-01', '2026-02-28'],
            [2028, 2, '2028-02-01', '2028-02-29'],
            [2026, 12, '2026-12-01', '2026-12-31'],
        ])('is that month of %i when month is %i', (year, month, from, to) => {
            expect(metricsPeriod(year, month)).toEqual({ from, to });
        });
    });

    it('yearOf reads the year of a calendar date', () => {
        expect(yearOf('2026-12-31')).toBe(2026);
    });

    it('daysWithin keeps the days of the period, both ends included', () => {
        const days = [day('2026-09-30', 1), day('2026-10-01', 2), day('2026-10-31', 3), day('2026-11-01', 4)];

        expect(daysWithin(days, { from: '2026-10-01', to: '2026-10-31' }).map((entry) => entry.day)).toEqual([
            '2026-10-01',
            '2026-10-31',
        ]);
    });

    describe('sumPeriod', () => {
        it('sums revenue, cost, profit, uncosted revenue, units and records; selling days are the rows', () => {
            const totals = sumPeriod([
                day('2026-10-01', 1000, { cost_cents: 400, quantity: 3, sales_count: 2 }),
                day('2026-10-02', 500, { quantity: 5 }), // no cost: all of it is uncosted
                day('2026-10-05', 300, { cost_cents: 900, uncosted_revenue_cents: 100, quantity: 2, sales_count: 2 }),
            ]);

            expect(totals).toEqual({
                revenue_cents: 1800,
                cost_cents: 1300,
                profit_cents: 500,
                uncosted_revenue_cents: 600,
                quantity: 10,
                sales_count: 5,
                selling_days: 3,
            });
        });

        it('keeps a negative profit', () => {
            expect(sumPeriod([day('2026-05-10', 60000, { cost_cents: 500000 })]).profit_cents).toBe(-440000);
        });

        it('is all zeros without sales', () => {
            expect(sumPeriod([])).toEqual({
                revenue_cents: 0,
                cost_cents: 0,
                profit_cents: 0,
                uncosted_revenue_cents: 0,
                quantity: 0,
                sales_count: 0,
                selling_days: 0,
            });
        });
    });

    describe('averageCents', () => {
        it('rounds to the nearest cent', () => {
            expect(averageCents(31897, 18)).toBe(1772); // 1772.05…
            expect(averageCents(31897, 40)).toBe(797); // 797.425
            expect(averageCents(5, 2)).toBe(3); // 2.5 rounds up
        });

        it('is null when there is nothing to divide by', () => {
            expect(averageCents(0, 0)).toBeNull();
        });
    });

    describe('weekOfMonthOf', () => {
        it.each([
            [1, 1],
            [7, 1],
            [8, 2],
            [14, 2],
            [15, 3],
            [21, 3],
            [22, 4],
            [28, 4],
            [29, 5],
            [31, 5],
        ])('day %i is in block %i', (dayOfMonth, block) => {
            expect(weekOfMonthOf(`2026-10-${String(dayOfMonth).padStart(2, '0')}`)).toBe(block);
        });
    });

    describe('weekdayOccurrences', () => {
        it('counts each weekday of October 2026 (it starts on a Thursday)', () => {
            // Monday … Sunday
            expect(weekdayOccurrences('2026-10-01', '2026-10-31')).toEqual([4, 4, 4, 5, 5, 5, 4]);
        });

        it('a single day counts once, for its own weekday', () => {
            expect(weekdayOccurrences('2026-11-08', '2026-11-08')).toEqual([0, 0, 0, 0, 0, 0, 1]);
        });

        it('whole weeks count every weekday equally, wherever they start', () => {
            expect(weekdayOccurrences('2026-11-04', '2026-11-17')).toEqual([2, 2, 2, 2, 2, 2, 2]);
        });

        it('a full year has 52 of each weekday plus one more of the weekday it starts on', () => {
            // 2026-01-01 is a Thursday.
            expect(weekdayOccurrences('2026-01-01', '2026-12-31')).toEqual([52, 52, 52, 53, 52, 52, 52]);
        });
    });

    describe('salesByWeekday', () => {
        it('returns seven zeroed entries, Monday first, without sales', () => {
            const weekdays = salesByWeekday([]);

            expect(weekdays.map((entry) => entry.iso_weekday)).toEqual([1, 2, 3, 4, 5, 6, 7]);
            weekdays.forEach((entry) =>
                expect(entry).toMatchObject({
                    revenue_cents: 0,
                    quantity: 0,
                    sales_count: 0,
                    occurrences: 0,
                    average_revenue_cents: null,
                }),
            );
        });

        it('buckets by the weekday of the calendar date and counts occurrences between first and last selling day', () => {
            const weekdays = salesByWeekday([
                day('2026-11-02', 1000, { quantity: 2 }), // Monday
                day('2026-11-08', 700), // Sunday
                day('2026-11-09', 500, { sales_count: 3 }), // Monday
            ]);

            expect(weekdays[0]).toEqual({
                iso_weekday: 1,
                revenue_cents: 1500,
                quantity: 3,
                sales_count: 4,
                occurrences: 2,
                average_revenue_cents: 750,
            });
            expect(weekdays[6]).toMatchObject({ revenue_cents: 700, occurrences: 1, average_revenue_cents: 700 });
            // Tuesday fell once inside the span and sold nothing: its average is 0, not null.
            expect(weekdays[1]).toMatchObject({ revenue_cents: 0, occurrences: 1, average_revenue_cents: 0 });
        });

        it('does not depend on the order of the rows', () => {
            const ordered = [day('2026-11-02', 1000), day('2026-11-08', 700)];

            expect(salesByWeekday([...ordered].reverse())).toEqual(salesByWeekday(ordered));
        });
    });

    describe('salesByWeekOfMonth', () => {
        it('returns the five blocks, zeroed, without sales', () => {
            expect(salesByWeekOfMonth([])).toEqual(
                [
                    [1, 1, 7],
                    [2, 8, 14],
                    [3, 15, 21],
                    [4, 22, 28],
                    [5, 29, 31],
                ].map(([week_of_month, start_day, end_day]) => ({
                    week_of_month,
                    start_day,
                    end_day,
                    revenue_cents: 0,
                    quantity: 0,
                    sales_count: 0,
                    months: 0,
                    average_revenue_cents: null,
                })),
            );
        });

        it('splits at days 7/8, 14/15, 21/22 and 28/29 and counts the months each block sold in', () => {
            const blocks = salesByWeekOfMonth([
                day('2026-09-07', 100),
                day('2026-09-08', 200),
                day('2026-09-14', 300),
                day('2026-09-15', 400),
                day('2026-09-21', 500),
                day('2026-09-22', 600),
                day('2026-09-28', 700),
                day('2026-09-29', 800),
                day('2026-10-07', 1000),
                day('2026-10-31', 2000),
            ]);

            expect(blocks.map((block) => [block.revenue_cents, block.months, block.average_revenue_cents])).toEqual([
                [1100, 2, 550],
                [500, 1, 500],
                [900, 1, 900],
                [1300, 1, 1300],
                [2800, 2, 1400],
            ]);
        });
    });

    describe('monthlyProfit', () => {
        it('returns twelve months, January first, zero-filling the ones without sales', () => {
            const months = monthlyProfit([
                day('2026-01-10', 30000),
                day('2026-04-10', 30000, { cost_cents: 12000 }),
                day('2026-04-11', 10000, { cost_cents: 4000 }),
                day('2026-12-31', 500, { cost_cents: 900 }),
            ]);

            expect(months.map((month) => month.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
            expect(months[0]).toEqual({
                month: 1,
                revenue_cents: 30000,
                cost_cents: 0,
                profit_cents: 30000,
                uncosted_revenue_cents: 30000,
            });
            expect(months[3]).toEqual({
                month: 4,
                revenue_cents: 40000,
                cost_cents: 16000,
                profit_cents: 24000,
                uncosted_revenue_cents: 0,
            });
            expect(months[11]).toMatchObject({ revenue_cents: 500, cost_cents: 900, profit_cents: -400 });
            expect(months[1]).toEqual({
                month: 2,
                revenue_cents: 0,
                cost_cents: 0,
                profit_cents: 0,
                uncosted_revenue_cents: 0,
            });
        });
    });

    describe('pickBestAverage', () => {
        const entry = (name: string, revenue_cents: number, divisor: number) => ({ name, revenue_cents, divisor });
        const pick = (entries: ReturnType<typeof entry>[]) => pickBestAverage(entries, (item) => item.divisor)?.name;

        it('picks the highest revenue per divisor, not the highest total', () => {
            expect(pick([entry('twice', 1000, 2), entry('once', 700, 1)])).toBe('once');
        });

        it('breaks ties in favour of the earliest entry', () => {
            expect(pick([entry('first', 500, 1), entry('second', 1000, 2), entry('third', 500, 1)])).toBe('first');
        });

        it('compares exactly: 199/6 and 100/3 both round to 33, but 100/3 is higher', () => {
            expect(averageCents(199, 6)).toBe(averageCents(100, 3));
            expect(pick([entry('lower', 199, 6), entry('higher', 100, 3)])).toBe('higher');
        });

        it('is null when nothing has revenue', () => {
            expect(pick([entry('zero', 0, 3), entry('none', 0, 0)])).toBeUndefined();
            expect(pickBestAverage([], () => 1)).toBeNull();
        });
    });

    describe('buildDashboardMetrics', () => {
        it('year view of a year in progress: the best block is the one with the highest monthly average, not the highest total', () => {
            const metrics = buildDashboardMetrics({
                year: 2026,
                daily_sales: THU_TO_SAT_SELLER,
                top_products: [],
                first_sale_date: '2026-10-01',
            });

            expect(
                metrics.sales_by_week_of_month.map((block) => [
                    block.revenue_cents,
                    block.months,
                    block.average_revenue_cents,
                ]),
            ).toEqual([
                [100000, 2, 50000],
                [60000, 2, 30000],
                [50000, 1, 50000],
                [70000, 1, 70000],
                [50000, 1, 50000],
            ]);
            // By total it would be block 1 (R$ 1.000), only because it has already happened twice.
            expect(metrics.best_week_of_month).toMatchObject({ week_of_month: 4, start_day: 22, end_day: 28 });
        });

        it('month view with five Saturdays: the best weekday is the one with the highest average per occurrence', () => {
            const metrics = buildDashboardMetrics({
                year: 2026,
                month: 10,
                daily_sales: OCTOBER_MON_TO_SAT_SELLER,
                top_products: [],
                first_sale_date: '2026-10-01',
            });

            expect(
                metrics.sales_by_weekday.map((weekday) => [
                    weekday.revenue_cents,
                    weekday.occurrences,
                    weekday.average_revenue_cents,
                ]),
            ).toEqual([
                [120000, 4, 30000], // Monday
                [100000, 4, 25000],
                [100000, 4, 25000],
                [125000, 5, 25000],
                [140000, 5, 28000],
                [145000, 5, 29000], // Saturday: highest total, five of them
                [0, 4, 0],
            ]);
            expect(metrics.best_weekday).toMatchObject({ iso_weekday: 1 });
        });

        it('year view: the period is the year and its totals equal the annual profit', () => {
            const metrics = buildDashboardMetrics({
                year: 2026,
                daily_sales: THU_TO_SAT_SELLER,
                top_products: [productSales()],
                first_sale_date: '2025-03-14',
            });

            expect(metrics).toMatchObject({
                year: 2026,
                month: null,
                period_start: '2026-01-01',
                period_end: '2026-12-31',
                first_sale_date: '2025-03-14',
                top_products: [productSales()],
            });
            expect(metrics.totals).toEqual({
                revenue_cents: 330000,
                cost_cents: 0,
                profit_cents: 330000,
                uncosted_revenue_cents: 330000,
                quantity: 19,
                sales_count: 19,
                selling_days: 19,
            });
            expect(metrics.annual_profit).toEqual({
                revenue_cents: 330000,
                cost_cents: 0,
                profit_cents: 330000,
                uncosted_revenue_cents: 330000,
            });
            expect(metrics.average_per_selling_day_cents).toBe(17368); // 330000 / 19 = 17368.42…
            expect(metrics.average_per_sale_cents).toBe(17368);
            expect(metrics.monthly_profit.map((month) => month.revenue_cents)).toEqual([
                0, 0, 0, 0, 0, 0, 0, 0, 0, 270000, 60000, 0,
            ]);
        });

        it('month view: the period narrows, the profit series still covers the year', () => {
            const metrics = buildDashboardMetrics({
                year: 2026,
                month: 11,
                daily_sales: THU_TO_SAT_SELLER,
                top_products: [],
                first_sale_date: '2026-10-01',
            });

            expect(metrics).toMatchObject({ month: 11, period_start: '2026-11-01', period_end: '2026-11-30' });
            expect(metrics.totals).toMatchObject({ revenue_cents: 60000, selling_days: 4 });
            expect(metrics.totals.revenue_cents).toBe(metrics.monthly_profit[10]?.revenue_cents);
            expect(metrics.annual_profit.revenue_cents).toBe(330000);
            // November: block 1 sold 500, block 2 (in progress) 100, each in one month.
            expect(metrics.best_week_of_month).toMatchObject({ week_of_month: 1, months: 1 });
            // Thursdays 5 and 12 (200 + 100), Friday 6 (150), Saturday 7 (150); span Nov 5..12 has two Thursdays.
            expect(metrics.sales_by_weekday[3]).toMatchObject({ revenue_cents: 30000, occurrences: 2 });
            expect(metrics.best_weekday).toMatchObject({ iso_weekday: 4 });
        });

        it('a period without sales: zeros, null averages and no best entries', () => {
            const metrics = buildDashboardMetrics({
                year: 2026,
                month: 2,
                daily_sales: THU_TO_SAT_SELLER,
                top_products: [],
                first_sale_date: '2026-10-01',
            });

            expect(metrics.period_end).toBe('2026-02-28');
            expect(metrics.totals).toMatchObject({ revenue_cents: 0, quantity: 0, sales_count: 0, selling_days: 0 });
            expect(metrics.average_per_selling_day_cents).toBeNull();
            expect(metrics.average_per_sale_cents).toBeNull();
            expect(metrics.best_weekday).toBeNull();
            expect(metrics.best_week_of_month).toBeNull();
            expect(metrics.sales_by_weekday).toHaveLength(7);
            expect(metrics.sales_by_week_of_month).toHaveLength(5);
            expect(metrics.monthly_profit).toHaveLength(12);
            expect(metrics.annual_profit.revenue_cents).toBe(330000);
        });

        it('a single sale: every average is that sale and both best entries point at it', () => {
            const metrics = buildDashboardMetrics({
                year: 2026,
                daily_sales: [day('2026-02-28', 1500, { cost_cents: 600, quantity: 5 })], // a Saturday, block 4
                top_products: [],
                first_sale_date: '2026-02-28',
            });

            expect(metrics.average_per_selling_day_cents).toBe(1500);
            expect(metrics.average_per_sale_cents).toBe(1500);
            expect(metrics.best_weekday).toMatchObject({ iso_weekday: 6, occurrences: 1, average_revenue_cents: 1500 });
            expect(metrics.best_week_of_month).toMatchObject({ week_of_month: 4, months: 1 });
            expect(metrics.totals).toMatchObject({ profit_cents: 900, uncosted_revenue_cents: 0 });
        });
    });
});
