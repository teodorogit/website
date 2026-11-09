import { HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { addDays } from '@/common/utils/date.util';
import { IntegrationApp, authAs, createIntegrationApp, resetDatabase } from './int-app.util';

/**
 * Sales goal + dashboard against the real PostgreSQL and the full HTTP pipeline.
 *
 * The dashboard tests pin "now" to Thursday 2026-11-05 15:00Z (12:00 in São Paulo, UTC-3 all year
 * since 2019) by faking ONLY `Date`; every timer stays real so Prisma, supertest and the HTTP server
 * behave normally. The process runs with TZ=Asia/Tokyo, so any bucketing done in the server's local
 * time instead of the user's timezone would move the boundary sales below to a different week.
 */
const NOW = new Date('2026-11-05T15:00:00.000Z');
const CURRENT_MONDAY = '2026-11-02';

/** The 8 default weeks for NOW, oldest first. */
const EIGHT_WEEKS = [
    '2026-09-14',
    '2026-09-21',
    '2026-09-28',
    '2026-10-05',
    '2026-10-12',
    '2026-10-19',
    '2026-10-26',
    '2026-11-02',
];

const ALICE = 'user_alice';
const BOB = 'user_bob';

function pinNow(): void {
    jest.useFakeTimers({
        now: NOW,
        advanceTimers: true,
        doNotFake: [
            'hrtime',
            'nextTick',
            'performance',
            'queueMicrotask',
            'requestAnimationFrame',
            'cancelAnimationFrame',
            'requestIdleCallback',
            'cancelIdleCallback',
            'setImmediate',
            'clearImmediate',
            'setInterval',
            'clearInterval',
            'setTimeout',
            'clearTimeout',
        ],
    });
}

/** A zero-or-more week entry as the API returns it. */
function week(weekStart: string, total: number) {
    return { weekStart, weekEnd: addDays(weekStart, 6), total };
}

describe('Sales goal + dashboard (real PostgreSQL)', () => {
    let ctx: IntegrationApp;
    let baseUrl: string;

    // One listening server for the whole file: supertest would otherwise call listen() per request,
    // which warns (MaxListenersExceeded) under the concurrent PUTs below.
    const http = () => request(baseUrl);

    /** First authenticated request creates the local user row; returns its id. */
    async function ensureUser(clerkUserId: string): Promise<string> {
        await http().get('/api/sales-goal').set(authAs(clerkUserId)).expect(HttpStatus.OK);
        const user = await ctx.prisma.user.findUniqueOrThrow({ where: { clerk_user_id: clerkUserId } });
        return user.id;
    }

    /** Inserts a sale with an exact instant (the API stamps the current wall-clock time, so it can't). */
    async function seedSale(
        userId: string,
        occurredAt: string,
        unitPriceCents: number,
        quantity = 1,
        name = 'Brigadeiro',
    ): Promise<void> {
        await ctx.prisma.sale.create({
            data: {
                user_id: userId,
                product_id: null,
                product_name_snapshot: name,
                unit_price_cents: unitPriceCents,
                quantity,
                occurred_at: new Date(occurredAt),
            },
        });
    }

    beforeAll(async () => {
        ctx = await createIntegrationApp();
        await ctx.app.listen(0, '127.0.0.1');
        baseUrl = await ctx.app.getUrl();
    });

    afterAll(async () => {
        await ctx.app.close();
    });

    beforeEach(async () => {
        await resetDatabase(ctx.prisma);
    });

    describe('GET/PUT /api/sales-goal', () => {
        it('GET without a goal answers 200 with nulls and creates no goal row', async () => {
            const response = await http().get('/api/sales-goal').set(authAs(ALICE)).expect(HttpStatus.OK);

            expect(response.body).toEqual({ amount: null, updatedAt: null });
            expect(await ctx.prisma.salesGoal.count()).toBe(0);
        });

        it('PUT creates the goal, then replaces it in the same row', async () => {
            const created = await http()
                .put('/api/sales-goal')
                .set(authAs(ALICE))
                .send({ amount: 1000 })
                .expect(HttpStatus.OK);

            const rowsAfterCreate = await ctx.prisma.salesGoal.findMany();
            expect(rowsAfterCreate).toHaveLength(1);
            const first = rowsAfterCreate[0]!;
            const alice = await ctx.prisma.user.findUniqueOrThrow({ where: { clerk_user_id: ALICE } });
            expect(first).toMatchObject({ user_id: alice.id, amount_cents: 100000 });
            expect(created.body).toEqual({ amount: 1000, updatedAt: first.updated_at.toISOString() });

            const fetched = await http().get('/api/sales-goal').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(fetched.body).toEqual(created.body);

            // Make sure the clock visibly moves between the two writes.
            await new Promise((resolve) => setTimeout(resolve, 20));

            const replaced = await http()
                .put('/api/sales-goal')
                .set(authAs(ALICE))
                .send({ amount: 250.55 })
                .expect(HttpStatus.OK);

            const rowsAfterReplace = await ctx.prisma.salesGoal.findMany();
            expect(rowsAfterReplace).toHaveLength(1);
            const second = rowsAfterReplace[0]!;
            expect(second).toMatchObject({ id: first.id, user_id: alice.id, amount_cents: 25055 });
            expect(second.created_at).toEqual(first.created_at);
            expect(second.updated_at.getTime()).toBeGreaterThan(first.updated_at.getTime());
            expect(replaced.body).toEqual({ amount: 250.55, updatedAt: second.updated_at.toISOString() });

            const refetched = await http().get('/api/sales-goal').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(refetched.body).toEqual(replaced.body);
        });

        it('concurrent PUTs for an existing user never create two rows or fail', async () => {
            const userId = await ensureUser(ALICE);
            const amounts = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];

            const responses = await Promise.all(
                amounts.map((amount) => http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount })),
            );

            expect(responses.map((response) => response.status)).toEqual(amounts.map(() => HttpStatus.OK));
            responses.forEach((response, index) => expect(response.body.amount).toBe(amounts[index]));

            const rows = await ctx.prisma.salesGoal.findMany();
            expect(rows).toHaveLength(1);
            expect(rows[0]!.user_id).toBe(userId);
            expect(amounts.map((amount) => amount * 100)).toContain(rows[0]!.amount_cents);

            const fetched = await http().get('/api/sales-goal').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(fetched.body).toEqual({
                amount: rows[0]!.amount_cents / 100,
                updatedAt: rows[0]!.updated_at.toISOString(),
            });
        });

        it('concurrent first-ever PUTs (user row not created yet) end with one user and one goal', async () => {
            const amounts = [10, 20, 30, 40, 50, 60, 70, 80];

            const responses = await Promise.all(
                amounts.map((amount) => http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount })),
            );

            expect(responses.map((response) => response.status)).toEqual(amounts.map(() => HttpStatus.OK));
            expect(await ctx.prisma.user.count()).toBe(1);

            const rows = await ctx.prisma.salesGoal.findMany();
            expect(rows).toHaveLength(1);
            expect(amounts.map((amount) => amount * 100)).toContain(rows[0]!.amount_cents);
        });

        it('keeps one goal per user: another user neither sees nor overwrites it', async () => {
            await http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount: 1000 }).expect(HttpStatus.OK);

            const bobBefore = await http().get('/api/sales-goal').set(authAs(BOB)).expect(HttpStatus.OK);
            expect(bobBefore.body).toEqual({ amount: null, updatedAt: null });

            await http().put('/api/sales-goal').set(authAs(BOB)).send({ amount: 5 }).expect(HttpStatus.OK);

            const alice = await http().get('/api/sales-goal').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(alice.body.amount).toBe(1000);
            expect(await ctx.prisma.salesGoal.count()).toBe(2);
        });

        it('400 for a non-positive amount and leaves the stored goal untouched', async () => {
            await http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount: 1000 }).expect(HttpStatus.OK);
            const before = await ctx.prisma.salesGoal.findFirstOrThrow();

            const response = await http()
                .put('/api/sales-goal')
                .set(authAs(ALICE))
                .send({ amount: 0 })
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
            expect(response.body.error.details).toEqual([{ field: 'amount', message: expect.any(String) }]);
            expect(await ctx.prisma.salesGoal.findMany()).toEqual([before]);
        });
    });

    describe('GET /api/dashboard', () => {
        beforeEach(() => {
            pinNow();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        const dashboard = (clerkUserId: string, query = '') =>
            http().get(`/api/dashboard${query}`).set(authAs(clerkUserId));

        it('pins "now" for the server: the current local Monday is 2026-11-02', () => {
            expect(new Date().getTime()).toBeGreaterThanOrEqual(NOW.getTime());
            expect(new Date().getTime()).toBeLessThan(NOW.getTime() + 60_000);
            expect(EIGHT_WEEKS[EIGHT_WEEKS.length - 1]).toBe(CURRENT_MONDAY);
        });

        it('a new user gets 8 zero-filled weeks, no goal, zero sold/remaining and no best week', async () => {
            const response = await dashboard(ALICE).expect(HttpStatus.OK);

            expect(response.body).toEqual({
                currency: 'BRL',
                salesGoal: null,
                sold: 0,
                remaining: 0,
                weeklySales: EIGHT_WEEKS.map((monday) => week(monday, 0)),
                bestWeek: null,
            });
        });

        describe('with sales across 10 weeks', () => {
            let aliceId: string;

            beforeEach(async () => {
                aliceId = await ensureUser(ALICE);
                const bobId = await ensureUser(BOB);

                // Week 2026-08-31 (10th week back, outside the default window).
                await seedSale(aliceId, '2026-09-01T15:00:00.000Z', 5000, 2); // 100.00
                // Week 2026-09-07: the last instant before the window opens (Sun 13 23:59:59.999 local).
                await seedSale(aliceId, '2026-09-14T02:59:59.999Z', 700); // 7.00
                // Week 2026-09-14: the first instant of the window (Mon 14 00:00 local).
                await seedSale(aliceId, '2026-09-14T03:00:00.000Z', 300); // 3.00
                // Week 2026-09-21: nothing. Week 2026-09-28: two sales.
                await seedSale(aliceId, '2026-09-28T15:00:00.000Z', 1250, 2); // 25.00
                await seedSale(aliceId, '2026-10-04T20:00:00.000Z', 999, 3); // 29.97 (Sun 4 17:00 local)
                // Weeks 2026-10-05 and 2026-10-12: nothing. Week 2026-10-19:
                await seedSale(aliceId, '2026-10-21T13:30:00.000Z', 4000); // 40.00
                // Monday 2026-11-02 02:00Z = Sunday 2026-11-01 23:00 in São Paulo → week 2026-10-26.
                await seedSale(aliceId, '2026-11-02T02:00:00.000Z', 1000); // 10.00
                // Monday 2026-11-02 03:00Z = Monday 00:00 in São Paulo → current week 2026-11-02.
                await seedSale(aliceId, '2026-11-02T03:00:00.000Z', 2000); // 20.00
                // Last instant of the current week (Sun 2026-11-08 23:59:59.999 local).
                await seedSale(aliceId, '2026-11-09T02:59:59.999Z', 400); // 4.00
                // First instant of next week: outside every window, but still part of the all-time sum.
                await seedSale(aliceId, '2026-11-09T03:00:00.000Z', 8000); // 80.00

                // Another user's sales never leak into Alice's dashboard.
                await seedSale(bobId, '2026-11-03T15:00:00.000Z', 99900, 10);
                await seedSale(bobId, '2026-10-26T15:00:00.000Z', 99900, 10);
            });

            // 100 + 7 + 3 + 25 + 29.97 + 40 + 10 + 20 + 4 + 80
            const ALL_TIME_SOLD = 318.97;

            it('buckets by the local Monday on real Postgres, zero-fills and ends at the current week', async () => {
                const response = await dashboard(ALICE).expect(HttpStatus.OK);

                expect(response.body).toEqual({
                    currency: 'BRL',
                    salesGoal: null,
                    sold: ALL_TIME_SOLD,
                    remaining: 0,
                    weeklySales: [
                        week('2026-09-14', 3),
                        week('2026-09-21', 0),
                        week('2026-09-28', 54.97),
                        week('2026-10-05', 0),
                        week('2026-10-12', 0),
                        week('2026-10-19', 40),
                        week('2026-10-26', 10),
                        week('2026-11-02', 24),
                    ],
                    bestWeek: week('2026-09-28', 54.97),
                });
            });

            it('weeks=1 returns only the current week', async () => {
                const response = await dashboard(ALICE, '?weeks=1').expect(HttpStatus.OK);

                expect(response.body).toEqual({
                    currency: 'BRL',
                    salesGoal: null,
                    sold: ALL_TIME_SOLD,
                    remaining: 0,
                    weeklySales: [week(CURRENT_MONDAY, 24)],
                    bestWeek: week(CURRENT_MONDAY, 24),
                });
            });

            it('weeks=10 reaches back to the oldest seeded week', async () => {
                const response = await dashboard(ALICE, '?weeks=10').expect(HttpStatus.OK);

                expect(response.body.weeklySales).toEqual([
                    week('2026-08-31', 100),
                    week('2026-09-07', 7),
                    week('2026-09-14', 3),
                    week('2026-09-21', 0),
                    week('2026-09-28', 54.97),
                    week('2026-10-05', 0),
                    week('2026-10-12', 0),
                    week('2026-10-19', 40),
                    week('2026-10-26', 10),
                    week('2026-11-02', 24),
                ]);
                expect(response.body.bestWeek).toEqual(week('2026-08-31', 100));
                expect(response.body.sold).toBe(ALL_TIME_SOLD);
            });

            it('weeks=52 returns 52 contiguous Mondays ending at the current week', async () => {
                const response = await dashboard(ALICE, '?weeks=52').expect(HttpStatus.OK);
                const weekly: { weekStart: string; weekEnd: string; total: number }[] = response.body.weeklySales;

                expect(weekly).toHaveLength(52);
                const expectedMondays = Array.from({ length: 52 }, (_, index) =>
                    addDays(CURRENT_MONDAY, (index - 51) * 7),
                );
                expect(weekly.map((entry) => entry.weekStart)).toEqual(expectedMondays);
                expect(expectedMondays[0]).toBe('2025-11-10');
                weekly.forEach((entry) => expect(entry.weekEnd).toBe(addDays(entry.weekStart, 6)));

                const nonZero = weekly.filter((entry) => entry.total !== 0);
                expect(nonZero).toEqual([
                    week('2026-08-31', 100),
                    week('2026-09-07', 7),
                    week('2026-09-14', 3),
                    week('2026-09-28', 54.97),
                    week('2026-10-19', 40),
                    week('2026-10-26', 10),
                    week('2026-11-02', 24),
                ]);
                expect(response.body.bestWeek).toEqual(week('2026-08-31', 100));
            });

            it('computes remaining against the all-time sold, with and without a goal', async () => {
                const withoutGoal = await dashboard(ALICE).expect(HttpStatus.OK);
                expect(withoutGoal.body).toMatchObject({ salesGoal: null, sold: ALL_TIME_SOLD, remaining: 0 });

                await http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount: 500 }).expect(HttpStatus.OK);
                const belowGoal = await dashboard(ALICE).expect(HttpStatus.OK);
                expect(belowGoal.body).toMatchObject({ salesGoal: 500, sold: ALL_TIME_SOLD, remaining: 181.03 });

                await http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount: 318.97 }).expect(HttpStatus.OK);
                const atGoal = await dashboard(ALICE).expect(HttpStatus.OK);
                expect(atGoal.body).toMatchObject({ salesGoal: 318.97, sold: ALL_TIME_SOLD, remaining: 0 });

                await http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount: 100 }).expect(HttpStatus.OK);
                const aboveGoal = await dashboard(ALICE).expect(HttpStatus.OK);
                expect(aboveGoal.body).toMatchObject({ salesGoal: 100, sold: ALL_TIME_SOLD, remaining: 0 });
            });

            it('another user only sees their own sales', async () => {
                const response = await dashboard(BOB, '?weeks=2').expect(HttpStatus.OK);

                expect(response.body).toEqual({
                    currency: 'BRL',
                    salesGoal: null,
                    sold: 19980,
                    remaining: 0,
                    weeklySales: [week('2026-10-26', 9990), week('2026-11-02', 9990)],
                    bestWeek: week('2026-10-26', 9990),
                });
            });
        });

        it('sold is the all-time sum at historical unit prices, surviving price edits and product deletion', async () => {
            const product = await http()
                .post('/api/products')
                .set(authAs(ALICE))
                .send({ name: 'Brownie', price: 10 })
                .expect(HttpStatus.CREATED);
            const productId: string = product.body.id;

            // Sold at R$ 10,00 on Tuesday of the current week (stamped 12:00 local by the API).
            await http()
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId, quantity: 3, date: '2026-11-03' })
                .expect(HttpStatus.CREATED);

            await http()
                .patch(`/api/products/${productId}`)
                .set(authAs(ALICE))
                .send({ price: 25 })
                .expect(HttpStatus.OK);

            // Sold at the new price in a previous week.
            await http()
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId, quantity: 1, date: '2026-10-20' })
                .expect(HttpStatus.CREATED);

            // A sale long before any window.
            const aliceId = (await ctx.prisma.user.findUniqueOrThrow({ where: { clerk_user_id: ALICE } })).id;
            await seedSale(aliceId, '2025-01-15T15:00:00.000Z', 1234, 1, 'Antigo');

            const expectedWeekly = EIGHT_WEEKS.map((monday) =>
                week(monday, monday === '2026-10-19' ? 25 : monday === CURRENT_MONDAY ? 30 : 0),
            );

            const afterEdit = await dashboard(ALICE).expect(HttpStatus.OK);
            expect(afterEdit.body).toEqual({
                currency: 'BRL',
                salesGoal: null,
                sold: 67.34,
                remaining: 0,
                weeklySales: expectedWeekly,
                bestWeek: week(CURRENT_MONDAY, 30),
            });

            await http().delete(`/api/products/${productId}`).set(authAs(ALICE)).expect(HttpStatus.NO_CONTENT);

            const sales = await ctx.prisma.sale.findMany({
                where: { user_id: aliceId },
                orderBy: { occurred_at: 'asc' },
            });
            expect(sales.map((sale) => [sale.product_id, sale.unit_price_cents, sale.quantity])).toEqual([
                [null, 1234, 1],
                [null, 2500, 1],
                [null, 1000, 3],
            ]);

            const afterDelete = await dashboard(ALICE).expect(HttpStatus.OK);
            expect(afterDelete.body).toEqual(afterEdit.body);
        });

        it('bestWeek ties go to the earliest week', async () => {
            const aliceId = await ensureUser(ALICE);
            await seedSale(aliceId, '2026-09-22T15:00:00.000Z', 2500, 2); // week 09-21: 50.00 (one sale)
            await seedSale(aliceId, '2026-10-06T15:00:00.000Z', 2500); // week 10-05: 25 + 25 = 50.00
            await seedSale(aliceId, '2026-10-07T15:00:00.000Z', 2500);
            await seedSale(aliceId, '2026-10-27T15:00:00.000Z', 1000, 5); // week 10-26: 50.00
            await seedSale(aliceId, '2026-11-03T15:00:00.000Z', 4999); // week 11-02: 49.99

            const response = await dashboard(ALICE).expect(HttpStatus.OK);

            expect(response.body.weeklySales).toEqual(
                EIGHT_WEEKS.map((monday) =>
                    week(
                        monday,
                        (
                            { '2026-09-21': 50, '2026-10-05': 50, '2026-10-26': 50, '2026-11-02': 49.99 } as Record<
                                string,
                                number
                            >
                        )[monday] ?? 0,
                    ),
                ),
            );
            expect(response.body.bestWeek).toEqual(week('2026-09-21', 50));
        });

        it('bestWeek is null when the window has no sales, even if older sales make sold > 0', async () => {
            const aliceId = await ensureUser(ALICE);
            await seedSale(aliceId, '2026-10-21T13:30:00.000Z', 4000);
            await http().put('/api/sales-goal').set(authAs(ALICE)).send({ amount: 30 }).expect(HttpStatus.OK);

            const response = await dashboard(ALICE, '?weeks=1').expect(HttpStatus.OK);

            expect(response.body).toEqual({
                currency: 'BRL',
                salesGoal: 30,
                sold: 40,
                remaining: 0,
                weeklySales: [week(CURRENT_MONDAY, 0)],
                bestWeek: null,
            });
        });

        it.each([
            ['0', 'Deve ser maior ou igual a 1.'],
            ['53', 'Deve ser menor ou igual a 52.'],
            ['abc', 'Deve ser um número inteiro.'],
        ])('400 VALIDATION_ERROR for weeks=%s', async (weeks, message) => {
            const response = await dashboard(ALICE, `?weeks=${weeks}`).expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field: 'weeks', message }],
                },
            });
        });
    });
});
