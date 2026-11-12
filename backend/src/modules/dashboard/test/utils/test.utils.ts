import { JestMock } from '@/common/types/types';
import { addDays } from '@/common/utils/date.util';
import { DashboardService } from '../../dashboard.service';
import { DailySalesTotal } from '../../entities/daily-sales-total.entity';
import { DashboardSummary } from '../../entities/dashboard-summary.entity';
import { ProductSalesTotal } from '../../entities/product-sales-total.entity';
import { WeeklySalesTotal } from '../../entities/weekly-sales-total.entity';
import { DashboardRepository } from '../../repository/dashboard.repository';

export const mockedDashboardService: JestMock<DashboardService> = {
    getDashboard: jest.fn(),
    getMetrics: jest.fn(),
};

export const mockedDashboardRepository: JestMock<DashboardRepository> = {
    findSalesGoalCents: jest.fn(),
    sumSoldCents: jest.fn(),
    sumWeeklySalesCents: jest.fn(),
    sumDailySales: jest.fn(),
    findTopProducts: jest.fn(),
    findFirstSaleAt: jest.fn(),
};

/** A day with one sale record of `quantity` units; cost defaults to 0, so all of its revenue is uncosted. */
export const day = (
    date: string,
    revenue_cents: number,
    overrides: Partial<Omit<DailySalesTotal, 'day' | 'revenue_cents'>> = {},
): DailySalesTotal => {
    const cost_cents = overrides.cost_cents ?? 0;

    return new DailySalesTotal({
        day: date,
        revenue_cents,
        cost_cents,
        uncosted_revenue_cents: cost_cents === 0 ? revenue_cents : 0,
        quantity: 1,
        sales_count: 1,
        ...overrides,
    });
};

export const productSales = (overrides: Partial<ProductSalesTotal> = {}): ProductSalesTotal =>
    new ProductSalesTotal({
        product_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        product_name: 'Brigadeiro',
        quantity: 40,
        revenue_cents: 12000,
        ...overrides,
    });

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
