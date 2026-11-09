import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from '@/common/test/e2e-app.util';
import { AUTH_HEADER, authenticateAs } from '@/modules/auth/test/utils/test.utils';
import { otherUser } from '@/modules/users/test/utils/test.utils';
import { DashboardModule } from '../dashboard.module';
import { DashboardService } from '../dashboard.service';
import { defaultDashboardSummary, mockedDashboardService, week } from './utils/test.utils';

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
});
