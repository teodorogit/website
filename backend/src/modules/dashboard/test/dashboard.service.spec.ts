import { Test } from '@nestjs/testing';
import { defaultAuthUser } from '@/modules/auth/test/utils/test.utils';
import { defaultUser, user_id } from '@/modules/users/test/utils/test.utils';
import { DashboardService } from '../dashboard.service';
import { DASHBOARD_REPOSITORY } from '../repository/dashboard.repository';
import { day, mockedDashboardRepository, mondaysFrom, productSales, week } from './utils/test.utils';

/** Pins "now" without faking the ticks Nest/Promise plumbing relies on. */
const pinNow = (iso: string) => jest.useFakeTimers({ now: new Date(iso), doNotFake: ['nextTick', 'setImmediate'] });

describe('DashboardService', () => {
    let service: DashboardService;
    const user = defaultAuthUser(); // America/Sao_Paulo (UTC−3, no DST since 2019)

    beforeEach(async () => {
        jest.resetAllMocks();

        const moduleRef = await Test.createTestingModule({
            providers: [{ provide: DASHBOARD_REPOSITORY, useValue: mockedDashboardRepository }, DashboardService],
        }).compile();

        service = moduleRef.get(DashboardService);

        mockedDashboardRepository.findSalesGoalCents.mockResolvedValue(null);
        mockedDashboardRepository.sumSoldCents.mockResolvedValue(0);
        mockedDashboardRepository.sumWeeklySalesCents.mockResolvedValue([]);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('scopes every repository call to the authenticated user', async () => {
        pinNow('2026-10-28T15:00:00.000Z');

        await service.getDashboard(user, 8);

        expect(mockedDashboardRepository.findSalesGoalCents).toHaveBeenCalledWith({ user_id });
        expect(mockedDashboardRepository.sumSoldCents).toHaveBeenCalledWith({ user_id });
        expect(mockedDashboardRepository.sumWeeklySalesCents).toHaveBeenCalledWith(
            { user_id },
            expect.anything(),
            'America/Sao_Paulo',
        );
    });

    it('queries the half-open range [first local Monday 00:00, next local Monday 00:00)', async () => {
        pinNow('2026-10-28T15:00:00.000Z'); // Wednesday in São Paulo

        await service.getDashboard(user, 8);

        expect(mockedDashboardRepository.sumWeeklySalesCents).toHaveBeenCalledWith(
            { user_id },
            {
                start: new Date('2026-09-07T03:00:00.000Z'), // Monday 2026-09-07 00:00 in São Paulo
                end: new Date('2026-11-02T03:00:00.000Z'), // Monday after the current week
            },
            'America/Sao_Paulo',
        );
    });

    it('returns 8 zero-filled weeks oldest first, the last one being the current week', async () => {
        pinNow('2026-10-28T15:00:00.000Z');
        mockedDashboardRepository.sumWeeklySalesCents.mockResolvedValueOnce([
            week('2026-09-14', 2500),
            week('2026-10-26', 600),
        ]);

        const summary = await service.getDashboard(user, 8);

        expect(summary.weekly_sales.map((w) => w.week_start)).toEqual(mondaysFrom('2026-09-07', 8));
        expect(summary.weekly_sales.map((w) => w.total_cents)).toEqual([0, 2500, 0, 0, 0, 0, 0, 600]);
        expect(summary.weekly_sales.at(-1)).toMatchObject({ week_start: '2026-10-26', week_end: '2026-11-01' });
        expect(summary.best_week).toMatchObject({ week_start: '2026-09-14', total_cents: 2500 });
    });

    it("uses the user's local date, not UTC or the server timezone, to find the current week", async () => {
        // 02:00Z on Monday Oct 26 is still Sunday Oct 25, 23:00 in São Paulo (and Monday 11:00 in Tokyo, the test TZ).
        pinNow('2026-10-26T02:00:00.000Z');

        const summary = await service.getDashboard(user, 1);

        expect(summary.weekly_sales.map((w) => w.week_start)).toEqual(['2026-10-19']);
        expect(mockedDashboardRepository.sumWeeklySalesCents).toHaveBeenCalledWith(
            { user_id },
            { start: new Date('2026-10-19T03:00:00.000Z'), end: new Date('2026-10-26T03:00:00.000Z') },
            'America/Sao_Paulo',
        );
    });

    it('keeps a sale at 2026-10-26T02:00Z (local Sunday) out of the week starting Monday Oct 26', async () => {
        pinNow('2026-10-28T15:00:00.000Z');

        await service.getDashboard(user, 1);

        const [, range] = mockedDashboardRepository.sumWeeklySalesCents.mock.calls[0] as [unknown, { start: Date }];
        expect(range.start.toISOString()).toBe('2026-10-26T03:00:00.000Z');
        expect(new Date('2026-10-26T02:00:00.000Z').getTime()).toBeLessThan(range.start.getTime());
    });

    it('follows the timezone stored on the user', async () => {
        pinNow('2026-10-26T02:00:00.000Z'); // already Monday in Tokyo
        const tokyoUser = defaultAuthUser(defaultUser({ timezone: 'Asia/Tokyo' }));

        const summary = await service.getDashboard(tokyoUser, 1);

        expect(summary.weekly_sales.map((w) => w.week_start)).toEqual(['2026-10-26']);
        expect(mockedDashboardRepository.sumWeeklySalesCents).toHaveBeenCalledWith(
            { user_id },
            { start: new Date('2026-10-25T15:00:00.000Z'), end: new Date('2026-11-01T15:00:00.000Z') },
            'Asia/Tokyo',
        );
    });

    it('supports weeks=52', async () => {
        pinNow('2026-11-05T12:00:00.000Z');

        const summary = await service.getDashboard(user, 52);

        expect(summary.weekly_sales).toHaveLength(52);
        expect(summary.weekly_sales[0]?.week_start).toBe('2025-11-10');
        expect(summary.weekly_sales[51]?.week_start).toBe('2026-11-02');
    });

    it('computes goal, all-time sold and remaining', async () => {
        pinNow('2026-11-05T12:00:00.000Z');
        mockedDashboardRepository.findSalesGoalCents.mockResolvedValueOnce(100000);
        mockedDashboardRepository.sumSoldCents.mockResolvedValueOnce(45000);

        const summary = await service.getDashboard(user, 8);

        expect(summary).toMatchObject({ sales_goal_cents: 100000, sold_cents: 45000, remaining_cents: 55000 });
    });

    it('returns remaining 0 when sold exceeds the goal', async () => {
        pinNow('2026-11-05T12:00:00.000Z');
        mockedDashboardRepository.findSalesGoalCents.mockResolvedValueOnce(10000);
        mockedDashboardRepository.sumSoldCents.mockResolvedValueOnce(45000);

        const summary = await service.getDashboard(user, 8);

        expect(summary).toMatchObject({ sales_goal_cents: 10000, sold_cents: 45000, remaining_cents: 0 });
    });

    it('returns a null goal and remaining 0 when there is no goal', async () => {
        pinNow('2026-11-05T12:00:00.000Z');
        mockedDashboardRepository.sumSoldCents.mockResolvedValueOnce(45000);

        const summary = await service.getDashboard(user, 8);

        expect(summary).toMatchObject({ sales_goal_cents: null, sold_cents: 45000, remaining_cents: 0 });
    });

    it('returns a null best week when nothing was sold in the window', async () => {
        pinNow('2026-11-05T12:00:00.000Z');
        mockedDashboardRepository.sumSoldCents.mockResolvedValueOnce(45000); // older sales only

        const summary = await service.getDashboard(user, 8);

        expect(summary.weekly_sales.every((w) => w.total_cents === 0)).toBe(true);
        expect(summary.best_week).toBeNull();
    });

    it('breaks best-week ties in favour of the earliest week', async () => {
        pinNow('2026-11-05T12:00:00.000Z');
        mockedDashboardRepository.sumWeeklySalesCents.mockResolvedValueOnce([
            week('2026-10-12', 900),
            week('2026-10-26', 900),
        ]);

        const summary = await service.getDashboard(user, 8);

        expect(summary.best_week).toMatchObject({ week_start: '2026-10-12', week_end: '2026-10-18', total_cents: 900 });
    });

    describe('getMetrics', () => {
        beforeEach(() => {
            mockedDashboardRepository.sumDailySales.mockResolvedValue([]);
            mockedDashboardRepository.findTopProducts.mockResolvedValue([]);
            mockedDashboardRepository.findFirstSaleAt.mockResolvedValue(null);
        });

        it('year view: the daily totals and the best sellers both cover the local year, half-open', async () => {
            pinNow('2026-11-05T12:00:00.000Z');

            const metrics = await service.getMetrics(user, { year: 2025 });

            const localYear = {
                start: new Date('2025-01-01T03:00:00.000Z'),
                end: new Date('2026-01-01T03:00:00.000Z'),
            };
            expect(mockedDashboardRepository.sumDailySales).toHaveBeenCalledWith(
                { user_id },
                localYear,
                'America/Sao_Paulo',
            );
            expect(mockedDashboardRepository.findTopProducts).toHaveBeenCalledWith({ user_id }, localYear, 5);
            expect(mockedDashboardRepository.findFirstSaleAt).toHaveBeenCalledWith({ user_id });
            expect(metrics).toMatchObject({
                year: 2025,
                month: null,
                period_start: '2025-01-01',
                period_end: '2025-12-31',
            });
        });

        it('month view: the best sellers cover only the month, the daily totals still the whole year', async () => {
            pinNow('2026-11-05T12:00:00.000Z');

            const metrics = await service.getMetrics(user, { year: 2028, month: 2 });

            expect(mockedDashboardRepository.sumDailySales).toHaveBeenCalledWith(
                { user_id },
                { start: new Date('2028-01-01T03:00:00.000Z'), end: new Date('2029-01-01T03:00:00.000Z') },
                'America/Sao_Paulo',
            );
            expect(mockedDashboardRepository.findTopProducts).toHaveBeenCalledWith(
                { user_id },
                // February of a leap year: up to, not including, March 1st 00:00 local.
                { start: new Date('2028-02-01T03:00:00.000Z'), end: new Date('2028-03-01T03:00:00.000Z') },
                5,
            );
            expect(metrics).toMatchObject({
                year: 2028,
                month: 2,
                period_start: '2028-02-01',
                period_end: '2028-02-29',
            });
        });

        it("defaults to the current year in the user's timezone, not in UTC or the server timezone", async () => {
            // 02:00Z on January 1st 2027 is still December 31st 2026, 23:00 in São Paulo (and 11:00 of 2027 in Tokyo).
            pinNow('2027-01-01T02:00:00.000Z');

            const metrics = await service.getMetrics(user, {});

            expect(metrics.year).toBe(2026);
            expect(mockedDashboardRepository.sumDailySales).toHaveBeenCalledWith(
                { user_id },
                { start: new Date('2026-01-01T03:00:00.000Z'), end: new Date('2027-01-01T03:00:00.000Z') },
                'America/Sao_Paulo',
            );
        });

        it('a month without a year is that month of the current year', async () => {
            pinNow('2026-11-05T12:00:00.000Z');

            const metrics = await service.getMetrics(user, { year: undefined, month: 3 });

            expect(metrics).toMatchObject({
                year: 2026,
                month: 3,
                period_start: '2026-03-01',
                period_end: '2026-03-31',
            });
        });

        it('follows the timezone stored on the user for the default year, the ranges and the first sale date', async () => {
            pinNow('2026-12-31T16:00:00.000Z'); // already January 1st 2027, 01:00 in Tokyo
            const tokyoUser = defaultAuthUser(defaultUser({ timezone: 'Asia/Tokyo' }));
            // 15:30Z on March 14th is March 15th, 00:30 in Tokyo.
            mockedDashboardRepository.findFirstSaleAt.mockResolvedValueOnce(new Date('2025-03-14T15:30:00.000Z'));

            const metrics = await service.getMetrics(tokyoUser, {});

            expect(metrics).toMatchObject({ year: 2027, first_sale_date: '2025-03-15' });
            expect(mockedDashboardRepository.sumDailySales).toHaveBeenCalledWith(
                { user_id },
                { start: new Date('2026-12-31T15:00:00.000Z'), end: new Date('2027-12-31T15:00:00.000Z') },
                'Asia/Tokyo',
            );
        });

        it('carves the period out of the daily totals and keeps the profit series on the whole year', async () => {
            pinNow('2026-11-05T12:00:00.000Z');
            mockedDashboardRepository.sumDailySales.mockResolvedValueOnce([
                day('2026-10-31', 4000, { cost_cents: 1000, quantity: 4 }),
                day('2026-11-01', 900, { cost_cents: 300, quantity: 3, sales_count: 2 }),
                day('2026-11-03', 600, { quantity: 2 }),
            ]);
            mockedDashboardRepository.findTopProducts.mockResolvedValueOnce([productSales()]);
            mockedDashboardRepository.findFirstSaleAt.mockResolvedValueOnce(new Date('2026-10-31T15:00:00.000Z'));

            const metrics = await service.getMetrics(user, { year: 2026, month: 11 });

            expect(metrics.totals).toEqual({
                revenue_cents: 1500,
                cost_cents: 300,
                profit_cents: 1200,
                uncosted_revenue_cents: 600,
                quantity: 5,
                sales_count: 3,
                selling_days: 2,
            });
            expect(metrics.average_per_selling_day_cents).toBe(750);
            expect(metrics.average_per_sale_cents).toBe(500);
            expect(metrics.top_products).toEqual([productSales()]);
            expect(metrics.first_sale_date).toBe('2026-10-31');
            expect(metrics.annual_profit).toEqual({
                revenue_cents: 5500,
                cost_cents: 1300,
                profit_cents: 4200,
                uncosted_revenue_cents: 600,
            });
            expect(metrics.monthly_profit[9]).toMatchObject({ month: 10, revenue_cents: 4000, profit_cents: 3000 });
            expect(metrics.monthly_profit[10]).toMatchObject({ month: 11, revenue_cents: 1500, profit_cents: 1200 });
        });

        it('accepts the last supported year', async () => {
            pinNow('2026-11-05T12:00:00.000Z');

            const metrics = await service.getMetrics(user, { year: 9998, month: 12 });

            expect(metrics).toMatchObject({ period_start: '9998-12-01', period_end: '9998-12-31' });
            expect(mockedDashboardRepository.findTopProducts).toHaveBeenCalledWith(
                { user_id },
                { start: new Date('9998-12-01T03:00:00.000Z'), end: new Date('9999-01-01T03:00:00.000Z') },
                5,
            );
        });
    });
});
