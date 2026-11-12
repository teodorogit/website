import { daysBetween, isoWeekdayOf, monthDateRange } from '@/common/utils/date.util';
import { DailySalesTotal } from '../entities/daily-sales-total.entity';
import {
    DashboardMetrics,
    MonthlyProfit,
    PeriodTotals,
    ProfitTotals,
    WeekOfMonthSales,
    WeekdaySales,
} from '../entities/dashboard-metrics.entity';
import { ProductSalesTotal } from '../entities/product-sales-total.entity';

/**
 * Pure rules of the dashboard metrics, computed over the daily totals of one year (at most 366 rows).
 * No I/O and no server clock: every date is a `YYYY-MM-DD` in the user's timezone, and the calendar
 * math runs on UTC-midnight dates (date.util), so the server's timezone can't leak in.
 */

/** Rows of the best-seller ranking. */
export const TOP_PRODUCTS_LIMIT = 5;

/**
 * "Week of the month" is a fixed block of days of the month, unrelated to the Monday weeks of the
 * weekly chart: blocks 1–4 hold every weekday exactly once, so they compare fairly whatever days the
 * user sells on. Block 5 is what is left (0 to 3 days).
 */
export const WEEK_OF_MONTH_BLOCKS = [
    { week_of_month: 1, start_day: 1, end_day: 7 },
    { week_of_month: 2, start_day: 8, end_day: 14 },
    { week_of_month: 3, start_day: 15, end_day: 21 },
    { week_of_month: 4, start_day: 22, end_day: 28 },
    { week_of_month: 5, start_day: 29, end_day: 31 },
] as const;

const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export type CalendarPeriod = { from: string; to: string };

export function yearOf(date: string): number {
    return Number(date.slice(0, 4));
}

function monthOf(date: string): number {
    return Number(date.slice(5, 7));
}

/** 1–5, see `WEEK_OF_MONTH_BLOCKS`. */
export function weekOfMonthOf(date: string): number {
    return Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1;
}

/** The whole `year`, or only its `month` (1–12) when given. Both ends are inclusive. */
export function metricsPeriod(year: number, month?: number): CalendarPeriod {
    if (month !== undefined) {
        return monthDateRange(year, month);
    }

    return { from: monthDateRange(year, 1).from, to: monthDateRange(year, 12).to };
}

export function daysWithin(days: DailySalesTotal[], period: CalendarPeriod): DailySalesTotal[] {
    return days.filter((day) => day.day >= period.from && day.day <= period.to);
}

export function sumProfit(days: DailySalesTotal[]): ProfitTotals {
    let revenue_cents = 0;
    let cost_cents = 0;
    let uncosted_revenue_cents = 0;

    for (const day of days) {
        revenue_cents += day.revenue_cents;
        cost_cents += day.cost_cents;
        uncosted_revenue_cents += day.uncosted_revenue_cents;
    }

    return { revenue_cents, cost_cents, profit_cents: revenue_cents - cost_cents, uncosted_revenue_cents };
}

export function sumPeriod(days: DailySalesTotal[]): PeriodTotals {
    return {
        ...sumProfit(days),
        quantity: sumOf(days, (day) => day.quantity),
        sales_count: sumOf(days, (day) => day.sales_count),
        // Every row is a day that had at least one sale.
        selling_days: days.length,
    };
}

/** `total / count` rounded to the cent; null when there is nothing to divide by. */
export function averageCents(total_cents: number, count: number): number | null {
    return count === 0 ? null : Math.round(total_cents / count);
}

/**
 * How many dates of each ISO weekday lie between `first` and `last`, both inclusive
 * (index 0 = Monday … 6 = Sunday).
 */
export function weekdayOccurrences(first: string, last: string): number[] {
    const totalDays = daysBetween(first, last) + 1;
    const fullWeeks = Math.floor(totalDays / 7);
    const extraDays = totalDays % 7;
    const firstWeekday = isoWeekdayOf(first);

    // The days left after the full weeks are the `extraDays` weekdays starting at `firstWeekday`.
    return ISO_WEEKDAYS.map((weekday) => fullWeeks + ((weekday - firstWeekday + 7) % 7 < extraDays ? 1 : 0));
}

/**
 * Seven entries, Monday first. The average divides by how many times the weekday fell between the
 * first and the last selling day, days without sales included: a month has five of some weekdays and
 * four of others, so totals alone would crown the calendar instead of the weekday.
 */
export function salesByWeekday(days: DailySalesTotal[]): WeekdaySales[] {
    const sellingDays = days.map((day) => day.day).sort();
    const first = sellingDays[0];
    const last = sellingDays[sellingDays.length - 1];
    const occurrences = first !== undefined && last !== undefined ? weekdayOccurrences(first, last) : [];

    return ISO_WEEKDAYS.map((iso_weekday) => {
        const ofWeekday = days.filter((day) => isoWeekdayOf(day.day) === iso_weekday);
        const revenue_cents = sumOf(ofWeekday, (day) => day.revenue_cents);
        const count = occurrences[iso_weekday - 1] ?? 0;

        return {
            iso_weekday,
            revenue_cents,
            quantity: sumOf(ofWeekday, (day) => day.quantity),
            sales_count: sumOf(ofWeekday, (day) => day.sales_count),
            occurrences: count,
            average_revenue_cents: averageCents(revenue_cents, count),
        };
    });
}

/**
 * Five entries, see `WEEK_OF_MONTH_BLOCKS`. The average divides by the months in which the block had
 * sales: in a year in progress block 1 has always happened once more than the later ones, so totals
 * alone would name block 1 almost regardless of the data.
 */
export function salesByWeekOfMonth(days: DailySalesTotal[]): WeekOfMonthSales[] {
    return WEEK_OF_MONTH_BLOCKS.map((block) => {
        const ofBlock = days.filter((day) => weekOfMonthOf(day.day) === block.week_of_month);
        const revenue_cents = sumOf(ofBlock, (day) => day.revenue_cents);
        const months = new Set(ofBlock.map((day) => day.day.slice(0, 7))).size;

        return {
            ...block,
            revenue_cents,
            quantity: sumOf(ofBlock, (day) => day.quantity),
            sales_count: sumOf(ofBlock, (day) => day.sales_count),
            months,
            average_revenue_cents: averageCents(revenue_cents, months),
        };
    });
}

/** Twelve entries, January first; months without sales are zeros. */
export function monthlyProfit(days: DailySalesTotal[]): MonthlyProfit[] {
    return MONTHS.map((month) => ({ month, ...sumProfit(days.filter((day) => monthOf(day.day) === month)) }));
}

/**
 * The entry with the highest `revenue_cents / divisor`, compared exactly (cross-multiplied in BigInt,
 * never on the rounded average). Ties go to the earliest entry, like `pickBestWeek`; null when nothing
 * has revenue. An entry with revenue always has a divisor of at least 1.
 */
export function pickBestAverage<T extends { revenue_cents: number }>(
    entries: T[],
    divisorOf: (entry: T) => number,
): T | null {
    let best: T | null = null;

    for (const entry of entries) {
        if (entry.revenue_cents <= 0) {
            continue;
        }

        if (
            best === null ||
            BigInt(entry.revenue_cents) * BigInt(divisorOf(best)) >
                BigInt(best.revenue_cents) * BigInt(divisorOf(entry))
        ) {
            best = entry;
        }
    }

    return best;
}

/** Assembles the metrics of `year` from its daily totals; `month` narrows the period, never the profit series. */
export function buildDashboardMetrics(params: {
    year: number;
    month?: number | undefined;
    /** Daily totals of the whole year. */
    daily_sales: DailySalesTotal[];
    /** Best sellers of the period, already ranked and cut. */
    top_products: ProductSalesTotal[];
    first_sale_date: string | null;
}): DashboardMetrics {
    const period = metricsPeriod(params.year, params.month);
    const periodDays = daysWithin(params.daily_sales, period);
    const totals = sumPeriod(periodDays);
    const byWeekday = salesByWeekday(periodDays);
    const byWeekOfMonth = salesByWeekOfMonth(periodDays);

    return new DashboardMetrics({
        year: params.year,
        month: params.month ?? null,
        period_start: period.from,
        period_end: period.to,
        first_sale_date: params.first_sale_date,
        totals,
        average_per_selling_day_cents: averageCents(totals.revenue_cents, totals.selling_days),
        average_per_sale_cents: averageCents(totals.revenue_cents, totals.sales_count),
        top_products: params.top_products,
        sales_by_weekday: byWeekday,
        best_weekday: pickBestAverage(byWeekday, (entry) => entry.occurrences),
        sales_by_week_of_month: byWeekOfMonth,
        best_week_of_month: pickBestAverage(byWeekOfMonth, (entry) => entry.months),
        monthly_profit: monthlyProfit(params.daily_sales),
        annual_profit: sumProfit(params.daily_sales),
    });
}

function sumOf<T>(items: T[], valueOf: (item: T) => number): number {
    return items.reduce((total, item) => total + valueOf(item), 0);
}
