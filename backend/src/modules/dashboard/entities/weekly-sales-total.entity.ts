import { addDays } from '@/common/utils/date.util';

/**
 * Revenue of one local week (Monday..Sunday in the user's timezone). A derived read model,
 * not a table row, so it has no id or timestamps.
 */
export class WeeklySalesTotal {
    /** Monday, `YYYY-MM-DD`, in the user's timezone. */
    week_start: string;
    /** Sunday of the same week; always `week_start + 6 days`. */
    week_end: string;
    total_cents: number;

    constructor(params: { week_start: string; total_cents: number }) {
        this.week_start = params.week_start;
        this.week_end = addDays(params.week_start, 6);
        this.total_cents = params.total_cents;
    }
}
