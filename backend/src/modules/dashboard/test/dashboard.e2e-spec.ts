import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from '@/common/test/e2e-app.util';
import { AUTH_HEADER, authenticateAs } from '@/modules/auth/test/utils/test.utils';
import { otherUser } from '@/modules/users/test/utils/test.utils';
import { DashboardModule } from '../dashboard.module';
import { DashboardService } from '../dashboard.service';
import { buildDashboardMetrics } from '../utils/sales-metrics.util';
import { day, defaultDashboardSummary, mockedDashboardService, productSales, week } from './utils/test.utils';

describe('Dashboard (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        app = await createE2eApp({
            imports: [DashboardModule],
            overrides: [{ provide: DashboardService, useValue: mockedDashboardService }],
        });
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    const get = (query = '') => request(app.getHttpServer()).get(`/api/dashboard${query}`).set(AUTH_HEADER);

    describe('GET /api/dashboard', () => {
        it('200 with the spec shape, money in reais and weeks defaulting to 8', async () => {
            const authUser = authenticateAs();
            mockedDashboardService.getDashboard.mockResolvedValueOnce(defaultDashboardSummary());

            const response = await get().expect(HttpStatus.OK);

            expect(response.body).toEqual({
                currency: 'BRL',
                salesGoal: 1000,
                sold: 450,
                remaining: 550,
                weeklySales: [
                    { weekStart: '2026-09-07', weekEnd: '2026-09-13', total: 120 },
                    { weekStart: '2026-09-14', weekEnd: '2026-09-20', total: 0 },
                ],
                bestWeek: { weekStart: '2026-09-07', weekEnd: '2026-09-13', total: 120 },
            });
            expect(mockedDashboardService.getDashboard).toHaveBeenCalledWith(authUser, 8);
        });

        it('passes the AuthUser derived from the token, never anything from the request', async () => {
            const authUser = authenticateAs(otherUser());
            mockedDashboardService.getDashboard.mockResolvedValueOnce(defaultDashboardSummary());

            await get('?weeks=4').expect(HttpStatus.OK);

            expect(mockedDashboardService.getDashboard).toHaveBeenCalledTimes(1);
            expect(mockedDashboardService.getDashboard).toHaveBeenCalledWith(authUser, 4);
        });

        it('keeps cent precision when converting to reais', async () => {
            authenticateAs();
            const weekly = [week('2026-11-02', 1999)];
            mockedDashboardService.getDashboard.mockResolvedValueOnce(
                defaultDashboardSummary({
                    sales_goal_cents: 10001,
                    sold_cents: 1999,
                    remaining_cents: 8002,
                    weekly_sales: weekly,
                    best_week: weekly[0] ?? null,
                }),
            );

            const response = await get('?weeks=1').expect(HttpStatus.OK);

            expect(response.body).toMatchObject({ salesGoal: 100.01, sold: 19.99, remaining: 80.02 });
            expect(response.body.weeklySales).toEqual([
                { weekStart: '2026-11-02', weekEnd: '2026-11-08', total: 19.99 },
            ]);
        });

        it('returns a null goal, zero remaining and a null best week', async () => {
            authenticateAs();
            mockedDashboardService.getDashboard.mockResolvedValueOnce(
                defaultDashboardSummary({
                    sales_goal_cents: null,
                    sold_cents: 0,
                    remaining_cents: 0,
                    weekly_sales: [week('2026-11-02', 0)],
                    best_week: null,
                }),
            );

            const response = await get('?weeks=1').expect(HttpStatus.OK);

            expect(response.body).toEqual({
                currency: 'BRL',
                salesGoal: null,
                sold: 0,
                remaining: 0,
                weeklySales: [{ weekStart: '2026-11-02', weekEnd: '2026-11-08', total: 0 }],
                bestWeek: null,
            });
        });

        it.each([1, 52])('accepts weeks=%i', async (weeks) => {
            const authUser = authenticateAs();
            mockedDashboardService.getDashboard.mockResolvedValueOnce(defaultDashboardSummary());

            await get(`?weeks=${weeks}`).expect(HttpStatus.OK);

            expect(mockedDashboardService.getDashboard).toHaveBeenCalledWith(authUser, weeks);
        });

        it.each([
            ['0', 'Deve ser maior ou igual a 1.'],
            ['-1', 'Deve ser maior ou igual a 1.'],
            ['53', 'Deve ser menor ou igual a 52.'],
            ['2.5', 'Deve ser um número inteiro.'],
            ['abc', 'Deve ser um número inteiro.'],
            ['', 'Deve ser maior ou igual a 1.'],
        ])('400 VALIDATION_ERROR for weeks=%p', async (weeks, message) => {
            authenticateAs();

            const response = await get(`?weeks=${weeks}`).expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field: 'weeks', message }],
                },
            });
            expect(mockedDashboardService.getDashboard).not.toHaveBeenCalled();
        });

        it('400 when weeks is repeated', async () => {
            authenticateAs();

            const response = await get('?weeks=4&weeks=8').expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(mockedDashboardService.getDashboard).not.toHaveBeenCalled();
        });

        it('400 for unknown query params such as userId', async () => {
            authenticateAs();

            const response = await get(`?userId=${otherUser().id}`).expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error).toEqual({
                code: 'VALIDATION_ERROR',
                message: 'Revise os campos enviados.',
                details: [{ field: 'userId', message: 'Campo não permitido.' }],
            });
            expect(mockedDashboardService.getDashboard).not.toHaveBeenCalled();
        });

        it('401 with the uniform envelope without a token', async () => {
            const response = await request(app.getHttpServer()).get('/api/dashboard').expect(HttpStatus.UNAUTHORIZED);

            expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' } });
            expect(mockedDashboardService.getDashboard).not.toHaveBeenCalled();
        });

        it('401 with an invalid token', async () => {
            authenticateAs();

            await request(app.getHttpServer())
                .get('/api/dashboard')
                .set('Authorization', 'Bearer not-the-test-token')
                .expect(HttpStatus.UNAUTHORIZED);
            expect(mockedDashboardService.getDashboard).not.toHaveBeenCalled();
        });

        it('500 envelope without internals when the service fails', async () => {
            authenticateAs();
            mockedDashboardService.getDashboard.mockRejectedValueOnce(new Error('relation "sales" does not exist'));

            const response = await get().expect(HttpStatus.INTERNAL_SERVER_ERROR);

            expect(response.body).toEqual({
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Ocorreu um erro inesperado.' },
            });
        });
    });

    describe('GET /api/dashboard/metrics', () => {
        const getMetrics = (query = '') =>
            request(app.getHttpServer()).get(`/api/dashboard/metrics${query}`).set(AUTH_HEADER);

        /** Two days of November 2026: Monday the 2nd and Sunday the 8th. */
        const metricsOf = (overrides: Parameters<typeof buildDashboardMetrics>[0] | object = {}) =>
            buildDashboardMetrics({
                year: 2026,
                daily_sales: [
                    day('2026-11-02', 1999, { cost_cents: 600, quantity: 7, sales_count: 3 }),
                    day('2026-11-08', 1000, { quantity: 2, sales_count: 2 }),
                ],
                top_products: [
                    productSales({ quantity: 7, revenue_cents: 1999 }),
                    productSales({ product_id: null, product_name: 'Brownie', quantity: 2, revenue_cents: 1000 }),
                ],
                first_sale_date: '2025-03-14',
                ...overrides,
            });

        const zeroProfit = { revenue: 0, cost: 0, profit: 0, revenueWithoutCost: 0 };
        const zeroWeekday = { revenue: 0, quantity: 0, salesCount: 0, occurrences: 1, averageRevenue: 0 };
        const zeroBlock = { revenue: 0, quantity: 0, salesCount: 0, months: 0, averageRevenue: null };

        it('200 with the spec shape, money in reais, and no year handed to the service when it is omitted', async () => {
            const authUser = authenticateAs();
            mockedDashboardService.getMetrics.mockResolvedValueOnce(metricsOf());

            const response = await getMetrics().expect(HttpStatus.OK);

            const brigadeiro = {
                productId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
                productName: 'Brigadeiro',
                quantity: 7,
                revenue: 19.99,
            };
            const monday = {
                isoWeekday: 1,
                revenue: 19.99,
                quantity: 7,
                salesCount: 3,
                occurrences: 1,
                averageRevenue: 19.99,
            };
            const blockOne = {
                weekOfMonth: 1,
                startDay: 1,
                endDay: 7,
                revenue: 19.99,
                quantity: 7,
                salesCount: 3,
                months: 1,
                averageRevenue: 19.99,
            };

            expect(response.body).toEqual({
                currency: 'BRL',
                year: 2026,
                month: null,
                period: { startDate: '2026-01-01', endDate: '2026-12-31' },
                firstSaleDate: '2025-03-14',
                totals: {
                    revenue: 29.99,
                    cost: 6,
                    profit: 23.99,
                    revenueWithoutCost: 10,
                    quantity: 9,
                    salesCount: 5,
                    sellingDays: 2,
                },
                averageSales: { perSellingDay: 15, perSale: 6 }, // 2999 / 2 = 1499.5 and 2999 / 5 = 599.8, in cents
                bestSellingProduct: brigadeiro,
                topProducts: [brigadeiro, { productId: null, productName: 'Brownie', quantity: 2, revenue: 10 }],
                salesByWeekday: [
                    monday,
                    { isoWeekday: 2, ...zeroWeekday },
                    { isoWeekday: 3, ...zeroWeekday },
                    { isoWeekday: 4, ...zeroWeekday },
                    { isoWeekday: 5, ...zeroWeekday },
                    { isoWeekday: 6, ...zeroWeekday },
                    { isoWeekday: 7, revenue: 10, quantity: 2, salesCount: 2, occurrences: 1, averageRevenue: 10 },
                ],
                bestWeekday: monday,
                salesByWeekOfMonth: [
                    blockOne,
                    {
                        weekOfMonth: 2,
                        startDay: 8,
                        endDay: 14,
                        revenue: 10,
                        quantity: 2,
                        salesCount: 2,
                        months: 1,
                        averageRevenue: 10,
                    },
                    { weekOfMonth: 3, startDay: 15, endDay: 21, ...zeroBlock },
                    { weekOfMonth: 4, startDay: 22, endDay: 28, ...zeroBlock },
                    { weekOfMonth: 5, startDay: 29, endDay: 31, ...zeroBlock },
                ],
                bestWeekOfMonth: blockOne,
                monthlyProfit: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) =>
                    month === 11
                        ? { month, revenue: 29.99, cost: 6, profit: 23.99, revenueWithoutCost: 10 }
                        : { month, ...zeroProfit },
                ),
                annualProfit: { revenue: 29.99, cost: 6, profit: 23.99, revenueWithoutCost: 10 },
            });
            expect(mockedDashboardService.getMetrics).toHaveBeenCalledWith(authUser, {
                year: undefined,
                month: undefined,
            });
        });

        it('returns nulls and empty rankings for a period without sales', async () => {
            authenticateAs();
            mockedDashboardService.getMetrics.mockResolvedValueOnce(
                metricsOf({ month: 2, top_products: [], first_sale_date: null }),
            );

            const response = await getMetrics('?year=2026&month=2').expect(HttpStatus.OK);

            expect(response.body).toMatchObject({
                year: 2026,
                month: 2,
                period: { startDate: '2026-02-01', endDate: '2026-02-28' },
                firstSaleDate: null,
                totals: { ...zeroProfit, quantity: 0, salesCount: 0, sellingDays: 0 },
                averageSales: { perSellingDay: null, perSale: null },
                bestSellingProduct: null,
                topProducts: [],
                bestWeekday: null,
                bestWeekOfMonth: null,
            });
            expect(response.body.salesByWeekday).toHaveLength(7);
            expect(response.body.salesByWeekOfMonth).toHaveLength(5);
            expect(response.body.monthlyProfit).toHaveLength(12);
        });

        it('keeps a negative profit', async () => {
            authenticateAs();
            mockedDashboardService.getMetrics.mockResolvedValueOnce(
                metricsOf({ daily_sales: [day('2026-05-10', 60000, { cost_cents: 500000 })] }),
            );

            const response = await getMetrics().expect(HttpStatus.OK);

            expect(response.body.annualProfit).toEqual({
                revenue: 600,
                cost: 5000,
                profit: -4400,
                revenueWithoutCost: 0,
            });
            expect(response.body.monthlyProfit[4]).toMatchObject({ month: 5, profit: -4400 });
        });

        it('passes the AuthUser derived from the token and the parsed year and month', async () => {
            const authUser = authenticateAs(otherUser());
            mockedDashboardService.getMetrics.mockResolvedValueOnce(metricsOf());

            await getMetrics('?year=2025&month=12').expect(HttpStatus.OK);

            expect(mockedDashboardService.getMetrics).toHaveBeenCalledTimes(1);
            expect(mockedDashboardService.getMetrics).toHaveBeenCalledWith(authUser, { year: 2025, month: 12 });
        });

        it.each([
            ['year=2000', { year: 2000, month: undefined }],
            ['year=9998', { year: 9998, month: undefined }],
            ['month=1', { year: undefined, month: 1 }],
            ['month=12', { year: undefined, month: 12 }],
        ])('accepts %s', async (query, expected) => {
            const authUser = authenticateAs();
            mockedDashboardService.getMetrics.mockResolvedValueOnce(metricsOf());

            await getMetrics(`?${query}`).expect(HttpStatus.OK);

            expect(mockedDashboardService.getMetrics).toHaveBeenCalledWith(authUser, expected);
        });

        it.each([
            ['year', '1999', 'Deve ser maior ou igual a 2000.'],
            ['year', '9999', 'Deve ser menor ou igual a 9998.'],
            ['year', '2026.5', 'Deve ser um número inteiro.'],
            ['year', 'abc', 'Deve ser um número inteiro.'],
            ['month', '0', 'Deve ser maior ou igual a 1.'],
            ['month', '13', 'Deve ser menor ou igual a 12.'],
            ['month', '1.5', 'Deve ser um número inteiro.'],
            ['month', 'nov', 'Deve ser um número inteiro.'],
            ['month', '', 'Deve ser maior ou igual a 1.'],
        ])('400 VALIDATION_ERROR for %s=%p', async (field, value, message) => {
            authenticateAs();

            const response = await getMetrics(`?${field}=${value}`).expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field, message }],
                },
            });
            expect(mockedDashboardService.getMetrics).not.toHaveBeenCalled();
        });

        it('400 when year is repeated', async () => {
            authenticateAs();

            const response = await getMetrics('?year=2026&year=2027').expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(mockedDashboardService.getMetrics).not.toHaveBeenCalled();
        });

        it.each(['userId=x', 'weeks=8'])('400 for the unknown query param %s', async (query) => {
            authenticateAs();

            const response = await getMetrics(`?${query}`).expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error).toEqual({
                code: 'VALIDATION_ERROR',
                message: 'Revise os campos enviados.',
                details: [{ field: query.split('=')[0], message: 'Campo não permitido.' }],
            });
            expect(mockedDashboardService.getMetrics).not.toHaveBeenCalled();
        });

        it('401 with the uniform envelope without a token', async () => {
            const response = await request(app.getHttpServer())
                .get('/api/dashboard/metrics')
                .expect(HttpStatus.UNAUTHORIZED);

            expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' } });
            expect(mockedDashboardService.getMetrics).not.toHaveBeenCalled();
        });

        it('500 envelope without internals when the service fails', async () => {
            authenticateAs();
            mockedDashboardService.getMetrics.mockRejectedValueOnce(new Error('relation "sales" does not exist'));

            const response = await getMetrics().expect(HttpStatus.INTERNAL_SERVER_ERROR);

            expect(response.body).toEqual({
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Ocorreu um erro inesperado.' },
            });
        });
    });
});
