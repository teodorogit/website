import { addDays, mondayOf } from '@/common/utils/date.util';
import { WeeklySalesTotal } from '../entities/weekly-sales-total.entity';

/**
 * Pure dashboard rules, kept free of I/O and of the server clock so they can be tested
 * with plain calendar dates. "Today" is always the user's local date (date.util `todayIn`).
 */

/** Mondays of the `weeks` most recent local weeks, oldest first; the last one is the week containing `today`. */
export function weekStartsEndingAt(today: string, weeks: number): string[] {
    const currentMonday = mondayOf(today);
    return Array.from({ length: weeks }, (_, index) => addDays(currentMonday, (index - (weeks - 1)) * 7));
}

/**
 * One entry per Monday in `weekStarts`, in that order, taking the SQL totals where present and 0 elsewhere
 * (the chart must show weeks without sales). Totals for weeks outside the window are ignored.
 */
export function zeroFillWeeks(weekStarts: string[], totals: WeeklySalesTotal[]): WeeklySalesTotal[] {
    const totalByWeek = new Map(totals.map((week) => [week.week_start, week.total_cents]));

    return weekStarts.map(
        (week_start) => new WeeklySalesTotal({ week_start, total_cents: totalByWeek.get(week_start) ?? 0 }),
    );
}

/** Highest-revenue week; ties go to the earliest week (the client used `findIndex`); null when nothing was sold. */
export function pickBestWeek(weeks: WeeklySalesTotal[]): WeeklySalesTotal | null {
    let best: WeeklySalesTotal | null = null;

    for (const week of weeks) {
        if (week.total_cents > (best?.total_cents ?? 0)) {
            best = week;
        }
    }

    return best;
}

/** `max(0, goal − sold)`; 0 when there is no goal (BACKEND_SCOPE.md §2 Dashboard). */
export function remainingCents(salesGoalCents: number | null, soldCents: number): number {
    return salesGoalCents === null ? 0 : Math.max(0, salesGoalCents - soldCents);
}
