import { JestMock } from '@/common/types/types';
import { addDays } from '@/common/utils/date.util';
import { DashboardService } from '../../dashboard.service';
import { DashboardSummary } from '../../entities/dashboard-summary.entity';
import { WeeklySalesTotal } from '../../entities/weekly-sales-total.entity';
import { DashboardRepository } from '../../repository/dashboard.repository';

export const mockedDashboardService: JestMock<DashboardService> = {
    getDashboard: jest.fn(),
};

export const mockedDashboardRepository: JestMock<DashboardRepository> = {
    findSalesGoalCents: jest.fn(),
    sumSoldCents: jest.fn(),
    sumWeeklySalesCents: jest.fn(),
};

export const week = (week_start: string, total_cents: number): WeeklySalesTotal =>
    new WeeklySalesTotal({ week_start, total_cents });

export const defaultDashboardSummary = (overrides: Partial<DashboardSummary> = {}): DashboardSummary => {
    const weekly_sales = [week('2026-09-07', 12000), week('2026-09-14', 0)];

    return new DashboardSummary({
        sales_goal_cents: 100000,
        sold_cents: 45000,
        remaining_cents: 55000,
        weekly_sales,
        best_week: weekly_sales[0] ?? null,
        ...overrides,
    });
};

/** Mondays from `firstMonday`, `count` weeks apart by 7 days (expected `weekStart` values). */
export const mondaysFrom = (firstMonday: string, count: number): string[] =>
    Array.from({ length: count }, (_, index) => addDays(firstMonday, index * 7));
