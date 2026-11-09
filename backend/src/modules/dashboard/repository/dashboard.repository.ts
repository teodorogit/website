import { UserScope } from '@/common/repository/repository';
import { WeeklySalesTotal } from '../entities/weekly-sales-total.entity';

export const DASHBOARD_REPOSITORY = 'DashboardRepository';

/** Read-only aggregates over the user's own sales and goal. Every query is scoped by `user_id`. */
export interface DashboardRepository {
    /** The user's goal in cents, or null when none was set. */
    findSalesGoalCents(scope: UserScope): Promise<number | null>;

    /** Σ quantity × historical unit price over ALL of the user's sales, in cents. */
    sumSoldCents(scope: UserScope): Promise<number>;

    /**
     * Revenue per local week (Monday start in `timeZone`) of sales with `occurred_at` in the half-open
     * range `[start, end)`. Weeks without sales are absent; the caller zero-fills.
     */
    sumWeeklySalesCents(
        scope: UserScope,
        range: { start: Date; end: Date },
        timeZone: string,
    ): Promise<WeeklySalesTotal[]>;
}
