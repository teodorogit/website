import { Inject, Injectable } from '@nestjs/common';
import { UserScope } from '@/common/repository/repository';
import { addDays, localDateRange, todayIn } from '@/common/utils/date.util';
import { AuthUser } from '@/modules/auth/auth-user';
import { DashboardSummary } from './entities/dashboard-summary.entity';
import { DASHBOARD_REPOSITORY, DashboardRepository } from './repository/dashboard.repository';
import { pickBestWeek, remainingCents, weekStartsEndingAt, zeroFillWeeks } from './utils/weekly-sales.util';

@Injectable()
export class DashboardService {
    constructor(
        @Inject(DASHBOARD_REPOSITORY)
        private readonly dashboardRepository: DashboardRepository,
    ) {}

    /** Goal chart and the last `weeks` local weeks of revenue (BACKEND_SCOPE.md §2 Dashboard). */
    async getDashboard(user: AuthUser, weeks: number): Promise<DashboardSummary> {
        const scope: UserScope = { user_id: user.id };
        const weekStarts = weekStartsEndingAt(todayIn(user.timezone), weeks);
        const firstMonday = weekStarts[0];
        const currentMonday = weekStarts[weekStarts.length - 1];

        if (firstMonday === undefined || currentMonday === undefined) {
            // The query DTO guarantees 1..52; this only narrows the indexed access.
            throw new RangeError(`weeks must be at least 1, got ${weeks}`);
        }

        // [first Monday 00:00, Monday after the current week 00:00) in the user's timezone.
        const range = localDateRange(firstMonday, addDays(currentMonday, 6), user.timezone);

        const [salesGoalCents, soldCents, weeklyTotals] = await Promise.all([
            this.dashboardRepository.findSalesGoalCents(scope),
            this.dashboardRepository.sumSoldCents(scope),
            this.dashboardRepository.sumWeeklySalesCents(scope, range, user.timezone),
        ]);

        const weeklySales = zeroFillWeeks(weekStarts, weeklyTotals);

        return new DashboardSummary({
            sales_goal_cents: salesGoalCents,
            sold_cents: soldCents,
            remaining_cents: remainingCents(salesGoalCents, soldCents),
            weekly_sales: weeklySales,
            best_week: pickBestWeek(weeklySales),
        });
    }
}
