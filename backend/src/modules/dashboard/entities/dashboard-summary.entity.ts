import { WeeklySalesTotal } from './weekly-sales-total.entity';

/** Everything the Dashboard page shows, recomputed from persisted data on every request (BACKEND_SCOPE.md §4). */
export class DashboardSummary {
    sales_goal_cents: number | null;
    /** All-time revenue of the user, not just the charted window (mirrors the current goal chart). */
    sold_cents: number;
    remaining_cents: number;
    /** Exactly the requested number of weeks, oldest first; the last one is the current week. */
    weekly_sales: WeeklySalesTotal[];
    best_week: WeeklySalesTotal | null;

    constructor(params: {
        sales_goal_cents: number | null;
        sold_cents: number;
        remaining_cents: number;
        weekly_sales: WeeklySalesTotal[];
        best_week: WeeklySalesTotal | null;
    }) {
        this.sales_goal_cents = params.sales_goal_cents;
        this.sold_cents = params.sold_cents;
        this.remaining_cents = params.remaining_cents;
        this.weekly_sales = params.weekly_sales;
        this.best_week = params.best_week;
    }
}
