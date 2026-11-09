import { HttpStatus, INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from '@/common/test/e2e-app.util';
import { AUTH_HEADER, authenticateAs } from '@/modules/auth/test/utils/test.utils';
import { otherUser } from '@/modules/users/test/utils/test.utils';
import { SalesGoalModule } from '../sales-goal.module';
import { SalesGoalService } from '../sales-goal.service';
import { defaultSalesGoal, mockedSalesGoalService } from './utils/test.utils';

const MONEY_MESSAGE = 'Deve ser um valor numérico com no máximo duas casas decimais.';

describe('SalesGoal (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        app = await createE2eApp({
            imports: [SalesGoalModule],
            overrides: [{ provide: SalesGoalService, useValue: mockedSalesGoalService }],
        });
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('GET /api/sales-goal', () => {
        it('401 without a token, and the service is never reached', async () => {
            const response = await request(app.getHttpServer()).get('/api/sales-goal').expect(HttpStatus.UNAUTHORIZED);

            expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' } });
            expect(mockedSalesGoalService.findByUser).not.toHaveBeenCalled();
        });

        it('200 { amount, updatedAt } in reais for the authenticated user', async () => {
            const authUser = authenticateAs();
            mockedSalesGoalService.findByUser.mockResolvedValueOnce(defaultSalesGoal({ amount_cents: 100_050 }));

            const response = await request(app.getHttpServer())
                .get('/api/sales-goal')
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ amount: 1000.5, updatedAt: '2026-10-24T12:00:00.000Z' });
            expect(mockedSalesGoalService.findByUser).toHaveBeenCalledWith(authUser);
        });

        it('200 { amount: null, updatedAt: null } when the user has no goal', async () => {
            authenticateAs();
            mockedSalesGoalService.findByUser.mockResolvedValueOnce(null);

            const response = await request(app.getHttpServer())
                .get('/api/sales-goal')
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ amount: null, updatedAt: null });
        });

        it('never exposes ids, user_id or cents', async () => {
            authenticateAs();
            mockedSalesGoalService.findByUser.mockResolvedValueOnce(defaultSalesGoal());

            const response = await request(app.getHttpServer())
                .get('/api/sales-goal')
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(Object.keys(response.body).sort()).toEqual(['amount', 'updatedAt']);
        });

        it('resolves the owner from the token only: another user gets their own scope', async () => {
            const other = authenticateAs(otherUser());
            mockedSalesGoalService.findByUser.mockResolvedValueOnce(null);

            await request(app.getHttpServer())
                .get('/api/sales-goal?userId=11111111-1111-4111-8111-111111111111')
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(mockedSalesGoalService.findByUser).toHaveBeenCalledWith(other);
        });
    });

    describe('PUT /api/sales-goal', () => {
        it('401 without a token, and the service is never reached', async () => {
            await request(app.getHttpServer())
                .put('/api/sales-goal')
                .send({ amount: 1000 })
                .expect(HttpStatus.UNAUTHORIZED);

            expect(mockedSalesGoalService.upsert).not.toHaveBeenCalled();
        });

        it('200 (not 201) with the stored goal', async () => {
            const authUser = authenticateAs();
            mockedSalesGoalService.upsert.mockResolvedValueOnce(
                defaultSalesGoal({ amount_cents: 123_456, updated_at: new Date('2026-11-05T15:30:00.000Z') }),
            );

            const response = await request(app.getHttpServer())
                .put('/api/sales-goal')
                .set(AUTH_HEADER)
                .send({ amount: 1234.56 })
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ amount: 1234.56, updatedAt: '2026-11-05T15:30:00.000Z' });
            expect(mockedSalesGoalService.upsert).toHaveBeenCalledWith(authUser, { amount: 1234.56 });
        });

        it.each([0.01, 1_000_000])('accepts the boundary amount %p', async (amount) => {
            authenticateAs();
            mockedSalesGoalService.upsert.mockResolvedValueOnce(defaultSalesGoal());

            await request(app.getHttpServer())
                .put('/api/sales-goal')
                .set(AUTH_HEADER)
                .send({ amount })
                .expect(HttpStatus.OK);
        });

        it.each<[string, Record<string, unknown>, string]>([
            ['zero', { amount: 0 }, 'Deve ser maior que 0.'],
            ['negative', { amount: -10 }, 'Deve ser maior que 0.'],
            ['more than two decimals', { amount: 10.001 }, MONEY_MESSAGE],
            // JSON serializes these as "1e-7" etc.; IsNumber's maxDecimalPlaces used to throw on them (500).
            ['a tiny exponent-form fraction (1e-7)', { amount: 1e-7 }, MONEY_MESSAGE],
            ['the smallest subnormal (5e-324), which rounds to 0.00', { amount: 5e-324 }, 'Deve ser maior que 0.'],
            ['a negative exponent-form fraction (-1e-7)', { amount: -1e-7 }, MONEY_MESSAGE],
            ['a numeric string', { amount: '1000' }, MONEY_MESSAGE],
            ['null', { amount: null }, MONEY_MESSAGE],
            ['missing', {}, MONEY_MESSAGE],
            ['above the maximum', { amount: 1_000_000.01 }, 'Deve ser menor ou igual a 1000000.'],
        ])('400 VALIDATION_ERROR when amount is %s', async (_, body, message) => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .put('/api/sales-goal')
                .set(AUTH_HEADER)
                .send(body)
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field: 'amount', message }],
                },
            });
            expect(mockedSalesGoalService.upsert).not.toHaveBeenCalled();
        });

        it.each(['userId', 'updatedAt', 'amountCents'])(
            '400 when the body carries the forbidden field %s',
            async (field) => {
                authenticateAs();

                const response = await request(app.getHttpServer())
                    .put('/api/sales-goal')
                    .set(AUTH_HEADER)
                    .send({ amount: 1000, [field]: 'x' })
                    .expect(HttpStatus.BAD_REQUEST);

                expect(response.body.error.code).toBe('VALIDATION_ERROR');
                expect(response.body.error.details).toEqual([{ field, message: 'Campo não permitido.' }]);
                expect(mockedSalesGoalService.upsert).not.toHaveBeenCalled();
            },
        );

        it('500 envelope without internals when persistence fails', async () => {
            authenticateAs();
            mockedSalesGoalService.upsert.mockRejectedValueOnce(new Error('relation "sales_goals" does not exist'));

            const response = await request(app.getHttpServer())
                .put('/api/sales-goal')
                .set(AUTH_HEADER)
                .send({ amount: 1000 })
                .expect(HttpStatus.INTERNAL_SERVER_ERROR);

            expect(response.body).toEqual({
                error: { code: 'INTERNAL_SERVER_ERROR', message: 'Ocorreu um erro inesperado.' },
            });
        });
    });
});
