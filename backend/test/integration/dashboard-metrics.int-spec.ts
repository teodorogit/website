import { HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { addDays, isoWeekdayOf } from '@/common/utils/date.util';
import { IntegrationApp, authAs, createIntegrationApp, resetDatabase } from './int-app.util';

/**
 * GET /api/dashboard/metrics against the real PostgreSQL and the full HTTP pipeline.
 *
 * "Now" is pinned to Thursday 2026-11-05 15:00Z (12:00 in São Paulo) by faking ONLY `Date`, like
 * dashboard-and-goal.int-spec.ts. The process runs with TZ=Asia/Tokyo, so any bucketing done in the
 * server's local time instead of the user's timezone would move the boundary sales below to another
 * day, weekday, block, month or year. Every expected number is derived by hand next to its seed.
 */
const NOW = new Date('2026-11-05T15:00:00.000Z');

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

const ZERO_PROFIT = { revenue: 0, cost: 0, profit: 0, revenueWithoutCost: 0 };

const BLOCKS = [
    { weekOfMonth: 1, startDay: 1, endDay: 7 },
    { weekOfMonth: 2, startDay: 8, endDay: 14 },
    { weekOfMonth: 3, startDay: 15, endDay: 21 },
    { weekOfMonth: 4, startDay: 22, endDay: 28 },
    { weekOfMonth: 5, startDay: 29, endDay: 31 },
];

/** The 12 months of a year, zero-filled except for the ones given. */
function months(
    nonZero: Record<number, { revenue: number; cost: number; profit: number; revenueWithoutCost: number }>,
) {
    return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((month) => ({ month, ...(nonZero[month] ?? ZERO_PROFIT) }));
}

type SaleSeed = {
    quantity?: number;
    costCents?: number;
    name?: string;
    productId?: string | null;
};

describe('Dashboard metrics (real PostgreSQL)', () => {
    let ctx: IntegrationApp;
    let baseUrl: string;

    const http = () => request(baseUrl);
    const metrics = (clerkUserId: string, query = '') =>
        http().get(`/api/dashboard/metrics${query}`).set(authAs(clerkUserId));

    /** First authenticated request creates the local user row; returns its id. */
    async function ensureUser(clerkUserId: string): Promise<string> {
        await http().get('/api/sales-goal').set(authAs(clerkUserId)).expect(HttpStatus.OK);
        const user = await ctx.prisma.user.findUniqueOrThrow({ where: { clerk_user_id: clerkUserId } });
        return user.id;
    }

    /** Inserts a sale with an exact instant and exact snapshots (the API stamps the current wall-clock time). */
    async function seedSale(
        userId: string,
        occurredAt: string,
        unitPriceCents: number,
        { quantity = 1, costCents = 0, name = 'Brigadeiro', productId = null }: SaleSeed = {},
    ): Promise<void> {
        await ctx.prisma.sale.create({
            data: {
                user_id: userId,
                product_id: productId,
                product_name_snapshot: name,
                unit_price_cents: unitPriceCents,
                unit_cost_cents: costCents,
                quantity,
                occurred_at: new Date(occurredAt),
            },
        });
    }

    /** A sale at noon in São Paulo on `date`. */
    const seedAtNoon = (userId: string, date: string, unitPriceCents: number, seed: SaleSeed = {}) =>
        seedSale(userId, `${date}T15:00:00.000Z`, unitPriceCents, seed);

    async function createProduct(
        clerkUserId: string,
        body: { name: string; price: number; preparationCost?: number },
    ): Promise<string> {
        const response = await http()
            .post('/api/products')
            .set(authAs(clerkUserId))
            .send(body)
            .expect(HttpStatus.CREATED);
        return response.body.id as string;
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
        pinNow();
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('a new user gets the current local year, zero-filled, with null averages and no best entries', async () => {
        const response = await metrics(ALICE).expect(HttpStatus.OK);

        expect(response.body).toEqual({
            currency: 'BRL',
            year: 2026,
            month: null,
            period: { startDate: '2026-01-01', endDate: '2026-12-31' },
            firstSaleDate: null,
            totals: { ...ZERO_PROFIT, quantity: 0, salesCount: 0, sellingDays: 0 },
            averageSales: { perSellingDay: null, perSale: null },
            bestSellingProduct: null,
            topProducts: [],
            salesByWeekday: [1, 2, 3, 4, 5, 6, 7].map((isoWeekday) => ({
                isoWeekday,
                revenue: 0,
                quantity: 0,
                salesCount: 0,
                occurrences: 0,
                averageRevenue: null,
            })),
            bestWeekday: null,
            salesByWeekOfMonth: BLOCKS.map((block) => ({
                ...block,
                revenue: 0,
                quantity: 0,
                salesCount: 0,
                months: 0,
                averageRevenue: null,
            })),
            bestWeekOfMonth: null,
            monthlyProfit: months({}),
            annualProfit: ZERO_PROFIT,
        });
    });

    describe('calendar boundaries in the user timezone', () => {
        let aliceId: string;

        beforeEach(async () => {
            aliceId = await ensureUser(ALICE);
            const bobId = await ensureUser(BOB);

            // 2025-12-31 23:59:59.999 local: the last instant BEFORE 2026.
            await seedSale(aliceId, '2026-01-01T02:59:59.999Z', 700);
            // 2026-01-01 00:00 local, a Thursday, block 1: 1 × 3.00, cost 1.00.
            await seedSale(aliceId, '2026-01-01T03:00:00.000Z', 300, { costCents: 100 });
            // Sunday 2026-11-01 23:30 local (already Monday 02:30 in UTC, 11:30 in Tokyo), block 1: 10.00, cost 4.00.
            await seedSale(aliceId, '2026-11-02T02:30:00.000Z', 1000, { costCents: 400 });
            // 2026-12-31 23:59:59.999 local, a Thursday, block 5: 2 × 4.00, no cost.
            await seedSale(aliceId, '2027-01-01T02:59:59.999Z', 400, { quantity: 2 });
            // 2027-01-01 00:00 local: the first instant AFTER 2026.
            await seedSale(aliceId, '2027-01-01T03:00:00.000Z', 8000);

            // Another user's sales never leak.
            await seedSale(bobId, '2026-06-15T15:00:00.000Z', 99900, { quantity: 10 });
        });

        it('year view: buckets by local day, weekday, block, month and year', async () => {
            const response = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);

            // Revenue 3 + 10 + 8 = 21; cost 1 + 4 + 0 = 5; 4 units in 3 records on 3 days.
            expect(response.body.totals).toEqual({
                revenue: 21,
                cost: 5,
                profit: 16,
                revenueWithoutCost: 8,
                quantity: 4,
                salesCount: 3,
                sellingDays: 3,
            });
            expect(response.body.averageSales).toEqual({ perSellingDay: 7, perSale: 7 });
            expect(response.body.period).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });
            // The oldest sale is the one on 2025-12-31 local, outside the period.
            expect(response.body.firstSaleDate).toBe('2025-12-31');

            expect(response.body.monthlyProfit).toEqual(
                months({
                    1: { revenue: 3, cost: 1, profit: 2, revenueWithoutCost: 0 },
                    11: { revenue: 10, cost: 4, profit: 6, revenueWithoutCost: 0 },
                    12: { revenue: 8, cost: 0, profit: 8, revenueWithoutCost: 8 },
                }),
            );
            expect(response.body.annualProfit).toEqual({ revenue: 21, cost: 5, profit: 16, revenueWithoutCost: 8 });

            // Selling span 2026-01-01 (Thursday) .. 2026-12-31: 52 of each weekday and a 53rd Thursday.
            // Thursday 3 + 8 = 11 → 1100 / 53 = 20.75 → 0.21; Sunday 10 → 1000 / 52 = 19.23 → 0.19.
            const thursday = {
                isoWeekday: 4,
                revenue: 11,
                quantity: 3,
                salesCount: 2,
                occurrences: 53,
                averageRevenue: 0.21,
            };
            expect(response.body.salesByWeekday[3]).toEqual(thursday);
            expect(response.body.salesByWeekday[6]).toEqual({
                isoWeekday: 7,
                revenue: 10,
                quantity: 1,
                salesCount: 1,
                occurrences: 52,
                averageRevenue: 0.19,
            });
            expect(response.body.salesByWeekday[0]).toEqual({
                isoWeekday: 1,
                revenue: 0,
                quantity: 0,
                salesCount: 0,
                occurrences: 52,
                averageRevenue: 0,
            });
            expect(response.body.bestWeekday).toEqual(thursday);

            // Block 1: Jan 1 (3) + Nov 1 (10) = 13 in 2 months → 6.50. Block 5: Dec 31 (8) in 1 month → 8.00.
            const blockFive = { ...BLOCKS[4], revenue: 8, quantity: 2, salesCount: 1, months: 1, averageRevenue: 8 };
            expect(response.body.salesByWeekOfMonth).toEqual([
                { ...BLOCKS[0], revenue: 13, quantity: 2, salesCount: 2, months: 2, averageRevenue: 6.5 },
                { ...BLOCKS[1], revenue: 0, quantity: 0, salesCount: 0, months: 0, averageRevenue: null },
                { ...BLOCKS[2], revenue: 0, quantity: 0, salesCount: 0, months: 0, averageRevenue: null },
                { ...BLOCKS[3], revenue: 0, quantity: 0, salesCount: 0, months: 0, averageRevenue: null },
                blockFive,
            ]);
            // By total it would be block 1 (13 against 8).
            expect(response.body.bestWeekOfMonth).toEqual(blockFive);
        });

        it('the neighbouring years only see their own side of midnight', async () => {
            const before = await metrics(ALICE, '?year=2025').expect(HttpStatus.OK);
            expect(before.body.totals).toMatchObject({ revenue: 7, salesCount: 1 });
            expect(before.body.monthlyProfit[11]).toMatchObject({ month: 12, revenue: 7 });

            const after = await metrics(ALICE, '?year=2027').expect(HttpStatus.OK);
            expect(after.body.totals).toMatchObject({ revenue: 80, salesCount: 1 });
            expect(after.body.monthlyProfit[0]).toMatchObject({ month: 1, revenue: 80 });
            expect(after.body.firstSaleDate).toBe('2025-12-31');
        });

        it('month view: the period narrows to the month and agrees with that month of the profit series', async () => {
            const response = await metrics(ALICE, '?year=2026&month=12').expect(HttpStatus.OK);

            expect(response.body).toMatchObject({
                year: 2026,
                month: 12,
                period: { startDate: '2026-12-01', endDate: '2026-12-31' },
                totals: {
                    revenue: 8,
                    cost: 0,
                    profit: 8,
                    revenueWithoutCost: 8,
                    quantity: 2,
                    salesCount: 1,
                    sellingDays: 1,
                },
                averageSales: { perSellingDay: 8, perSale: 8 },
                // The profit series still covers the whole year.
                annualProfit: { revenue: 21, cost: 5, profit: 16, revenueWithoutCost: 8 },
            });
            expect(response.body.monthlyProfit[11]).toEqual({
                month: 12,
                revenue: 8,
                cost: 0,
                profit: 8,
                revenueWithoutCost: 8,
            });
            // One selling day: its weekday occurs once in the span, the others not at all.
            expect(response.body.bestWeekday).toMatchObject({ isoWeekday: 4, occurrences: 1, averageRevenue: 8 });
            expect(response.body.salesByWeekday[0]).toMatchObject({ occurrences: 0, averageRevenue: null });
            expect(response.body.bestWeekOfMonth).toMatchObject({ weekOfMonth: 5, months: 1 });
        });

        it('another user only sees their own sales', async () => {
            const response = await metrics(BOB, '?year=2026').expect(HttpStatus.OK);

            expect(response.body.totals).toMatchObject({ revenue: 9990, quantity: 10, salesCount: 1 });
            expect(response.body.firstSaleDate).toBe('2026-06-15');
            expect(response.body.topProducts).toEqual([
                { productId: null, productName: 'Brigadeiro', quantity: 10, revenue: 9990 },
            ]);
        });
    });

    it("follows the user's own timezone, across a daylight-saving change (America/New_York)", async () => {
        const aliceId = await ensureUser(ALICE);
        await ctx.prisma.user.update({ where: { id: aliceId }, data: { timezone: 'America/New_York' } });

        // 2025-12-31 23:59:59.999 EST (UTC−5): still 2025 in New York, already 01:59 of January 1st in São Paulo.
        await seedSale(aliceId, '2026-01-01T04:59:59.999Z', 900);
        // Saturday 2026-03-07 23:59:59.999 EST.
        await seedSale(aliceId, '2026-03-08T04:59:59.999Z', 100);
        // Sunday 2026-03-08 00:00 EST; clocks jump to EDT (UTC−4) at 02:00 that day.
        await seedSale(aliceId, '2026-03-08T05:00:00.000Z', 200);
        // Sunday 2026-03-08 23:59:59.999 EDT.
        await seedSale(aliceId, '2026-03-09T03:59:59.999Z', 400);
        // Monday 2026-03-09 00:00 EDT.
        await seedSale(aliceId, '2026-03-09T04:00:00.000Z', 800);

        const response = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);

        expect(response.body.firstSaleDate).toBe('2025-12-31');
        expect(response.body.totals).toMatchObject({ revenue: 15, salesCount: 4, sellingDays: 3 });
        expect(
            response.body.salesByWeekday.map((weekday: { revenue: number; occurrences: number }) => [
                weekday.revenue,
                weekday.occurrences,
            ]),
            // Span Saturday Mar 7 .. Monday Mar 9.
        ).toEqual([
            [8, 1],
            [0, 0],
            [0, 0],
            [0, 0],
            [0, 0],
            [1, 1],
            [6, 1],
        ]);
        // Mar 7 is in block 1; Mar 8 and 9 in block 2.
        expect(response.body.salesByWeekOfMonth.map((block: { revenue: number }) => block.revenue)).toEqual([
            1, 14, 0, 0, 0,
        ]);
    });

    describe('best-of rules on a calendar that favours totals', () => {
        it('year in progress: the best block of the month is the highest monthly average, not the highest total', async () => {
            const aliceId = await ensureUser(ALICE);

            // A Thursday-to-Saturday seller, first sale 2026-10-01: R$ 500 per block, R$ 700 on days 22–28.
            const sales: [string, number][] = [
                ['2026-10-01', 20000],
                ['2026-10-02', 15000],
                ['2026-10-03', 15000], // block 1: 500
                ['2026-10-08', 20000],
                ['2026-10-09', 15000],
                ['2026-10-10', 15000], // block 2: 500
                ['2026-10-15', 20000],
                ['2026-10-16', 15000],
                ['2026-10-17', 15000], // block 3: 500
                ['2026-10-22', 30000],
                ['2026-10-23', 20000],
                ['2026-10-24', 20000], // block 4: 700
                ['2026-10-29', 20000],
                ['2026-10-30', 15000],
                ['2026-10-31', 15000], // block 5: 500
                ['2026-11-05', 20000],
                ['2026-11-06', 15000],
                ['2026-11-07', 15000], // block 1 again: 500
                ['2026-11-12', 10000], // block 2, in progress: 100
            ];
            for (const [date, cents] of sales) {
                await seedAtNoon(aliceId, date, cents);
            }

            const response = await metrics(ALICE).expect(HttpStatus.OK);

            expect(
                response.body.salesByWeekOfMonth.map(
                    (block: { revenue: number; months: number; averageRevenue: number }) => [
                        block.revenue,
                        block.months,
                        block.averageRevenue,
                    ],
                ),
            ).toEqual([
                [1000, 2, 500],
                [600, 2, 300],
                [500, 1, 500],
                [700, 1, 700],
                [500, 1, 500],
            ]);
            expect(response.body.bestWeekOfMonth).toEqual({
                ...BLOCKS[3],
                revenue: 700,
                quantity: 3,
                salesCount: 3,
                months: 1,
                averageRevenue: 700,
            });
            // 3300 in 19 days and 19 records: 330000 / 19 = 17368.42 cents.
            expect(response.body.totals).toMatchObject({ revenue: 3300, salesCount: 19, sellingDays: 19 });
            expect(response.body.averageSales).toEqual({ perSellingDay: 173.68, perSale: 173.68 });
            // Span Oct 1 (Thursday) .. Nov 12 (Thursday): 7 Thursdays (1400 → 200.00), 6 of the others (950 → 158.33).
            expect(response.body.bestWeekday).toMatchObject({
                isoWeekday: 4,
                revenue: 1400,
                occurrences: 7,
                averageRevenue: 200,
            });
            expect(response.body.salesByWeekday[4]).toMatchObject({
                revenue: 950,
                occurrences: 6,
                averageRevenue: 158.33,
            });
        });

        it('month with five Saturdays: the best weekday is the highest average per occurrence, not the highest total', async () => {
            const aliceId = await ensureUser(ALICE);

            // Monday to Saturday, every selling day of October 2026: 300 on Mondays, 290 on Saturdays,
            // 280 on Fridays, 250 on the other days. October has 5 Thursdays, Fridays and Saturdays.
            for (let index = 0; index < 31; index += 1) {
                const date = addDays('2026-10-01', index);
                const weekday = isoWeekdayOf(date);
                if (weekday !== 7) {
                    await seedAtNoon(
                        aliceId,
                        date,
                        weekday === 1 ? 30000 : weekday === 6 ? 29000 : weekday === 5 ? 28000 : 25000,
                    );
                }
            }

            const response = await metrics(ALICE, '?year=2026&month=10').expect(HttpStatus.OK);

            expect(
                response.body.salesByWeekday.map(
                    (weekday: { revenue: number; occurrences: number; averageRevenue: number }) => [
                        weekday.revenue,
                        weekday.occurrences,
                        weekday.averageRevenue,
                    ],
                ),
            ).toEqual([
                [1200, 4, 300],
                [1000, 4, 250],
                [1000, 4, 250],
                [1250, 5, 250],
                [1400, 5, 280],
                [1450, 5, 290], // Saturday has the highest total
                [0, 4, 0],
            ]);
            expect(response.body.bestWeekday).toEqual({
                isoWeekday: 1,
                revenue: 1200,
                quantity: 4,
                salesCount: 4,
                occurrences: 4,
                averageRevenue: 300,
            });
        });
    });

    describe('month view', () => {
        it('February of a leap year ends on the 29th and matches the year view', async () => {
            const aliceId = await ensureUser(ALICE);

            // Tuesday 2028-02-29 12:00 local: 2 × 5.00, cost 1.00 each.
            await seedSale(aliceId, '2028-02-29T15:00:00.000Z', 500, { quantity: 2, costCents: 100 });
            // 2028-02-29 23:59:59.999 local: 3.00, no cost.
            await seedSale(aliceId, '2028-03-01T02:59:59.999Z', 300);
            // 2028-03-01 00:00 local: 7.00, no cost.
            await seedSale(aliceId, '2028-03-01T03:00:00.000Z', 700);

            const february = { revenue: 13, cost: 2, profit: 11, revenueWithoutCost: 3 };
            const month = await metrics(ALICE, '?year=2028&month=2').expect(HttpStatus.OK);

            expect(month.body.period).toEqual({ startDate: '2028-02-01', endDate: '2028-02-29' });
            expect(month.body.totals).toEqual({ ...february, quantity: 3, salesCount: 2, sellingDays: 1 });
            expect(month.body.averageSales).toEqual({ perSellingDay: 13, perSale: 6.5 });

            const year = await metrics(ALICE, '?year=2028').expect(HttpStatus.OK);

            expect(year.body.monthlyProfit).toEqual(
                months({ 2: february, 3: { revenue: 7, cost: 0, profit: 7, revenueWithoutCost: 7 } }),
            );
            expect(year.body.monthlyProfit[1]).toEqual(month.body.monthlyProfit[1]);
            expect(year.body.annualProfit).toEqual({ revenue: 20, cost: 2, profit: 18, revenueWithoutCost: 10 });
            // In the year view the period totals are the annual profit.
            expect(year.body.totals).toEqual({ ...year.body.annualProfit, quantity: 4, salesCount: 3, sellingDays: 2 });
        });

        it('February of a common year ends on the 28th; a month without a year is that month of the current year', async () => {
            const response = await metrics(ALICE, '?month=2').expect(HttpStatus.OK);

            expect(response.body).toMatchObject({
                year: 2026,
                month: 2,
                period: { startDate: '2026-02-01', endDate: '2026-02-28' },
            });
        });
    });

    describe('best sellers', () => {
        it('ranks by units, then revenue, then name, and keeps only five', async () => {
            const aliceId = await ensureUser(ALICE);
            const bobId = await ensureUser(BOB);

            await seedAtNoon(aliceId, '2026-03-02', 100, { name: 'Alfa', quantity: 10 }); // 10 un, 10.00
            await seedAtNoon(aliceId, '2026-03-03', 200, { name: 'Charlie', quantity: 9 }); // 9 un, 18.00
            await seedAtNoon(aliceId, '2026-03-04', 300, { name: 'Bravo', quantity: 4 }); // 9 un in two sales, 27.00
            await seedAtNoon(aliceId, '2026-03-05', 300, { name: 'Bravo', quantity: 5 });
            await seedAtNoon(aliceId, '2026-03-06', 100, { name: 'Echo', quantity: 8 }); // 8 un, 8.00
            await seedAtNoon(aliceId, '2026-03-07', 100, { name: 'Delta', quantity: 8 }); // 8 un, 8.00
            await seedAtNoon(aliceId, '2026-03-08', 9900, { name: 'Foxtrot', quantity: 6 }); // 6 un, 594.00: cut
            // Same name in another account: never mixed in.
            await seedAtNoon(bobId, '2026-03-02', 100, { name: 'Alfa', quantity: 999 });

            const response = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);

            expect(response.body.topProducts).toEqual([
                { productId: null, productName: 'Alfa', quantity: 10, revenue: 10 },
                { productId: null, productName: 'Bravo', quantity: 9, revenue: 27 },
                { productId: null, productName: 'Charlie', quantity: 9, revenue: 18 },
                { productId: null, productName: 'Delta', quantity: 8, revenue: 8 },
                { productId: null, productName: 'Echo', quantity: 8, revenue: 8 },
            ]);
            expect(response.body.bestSellingProduct).toEqual(response.body.topProducts[0]);
            // The ranking is cut by units, but the totals still count every product.
            expect(response.body.totals).toMatchObject({ revenue: 665, quantity: 50 });
        });

        it('only ranks the sales of the period', async () => {
            const aliceId = await ensureUser(ALICE);
            await seedAtNoon(aliceId, '2026-03-31', 100, { name: 'Alfa', quantity: 50 });
            await seedAtNoon(aliceId, '2026-04-01', 100, { name: 'Bravo', quantity: 2 });

            const april = await metrics(ALICE, '?year=2026&month=4').expect(HttpStatus.OK);
            expect(april.body.topProducts).toEqual([
                { productId: null, productName: 'Bravo', quantity: 2, revenue: 2 },
            ]);

            const year = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);
            expect(year.body.bestSellingProduct).toMatchObject({ productName: 'Alfa', quantity: 50 });
        });

        it('a renamed product is one row under its current name; deleting it splits the row by recorded name', async () => {
            const aliceId = await ensureUser(ALICE);
            const brigadeiro = await createProduct(ALICE, { name: 'Brigadero', price: 3 });
            const beijinho = await createProduct(ALICE, { name: 'Beijinho', price: 3.5 });

            await seedAtNoon(aliceId, '2026-05-04', 300, { name: 'Brigadero', quantity: 30, productId: brigadeiro });
            await http()
                .patch(`/api/products/${brigadeiro}`)
                .set(authAs(ALICE))
                .send({ name: 'Brigadeiro' })
                .expect(HttpStatus.OK);
            await seedAtNoon(aliceId, '2026-05-05', 300, { name: 'Brigadeiro', quantity: 30, productId: brigadeiro });
            await seedAtNoon(aliceId, '2026-05-06', 350, { name: 'Beijinho', quantity: 40, productId: beijinho });

            const renamed = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);

            // 30 + 30 units under the current name.
            expect(renamed.body.topProducts).toEqual([
                { productId: brigadeiro, productName: 'Brigadeiro', quantity: 60, revenue: 180 },
                { productId: beijinho, productName: 'Beijinho', quantity: 40, revenue: 140 },
            ]);

            await http().delete(`/api/products/${brigadeiro}`).set(authAs(ALICE)).expect(HttpStatus.NO_CONTENT);

            const deleted = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);

            // With the product gone, the only identity left is the name stored on each sale.
            expect(deleted.body.topProducts).toEqual([
                { productId: beijinho, productName: 'Beijinho', quantity: 40, revenue: 140 },
                { productId: null, productName: 'Brigadeiro', quantity: 30, revenue: 90 },
                { productId: null, productName: 'Brigadero', quantity: 30, revenue: 90 },
            ]);
            expect(deleted.body.bestSellingProduct).toMatchObject({ productName: 'Beijinho' });
            // Money is untouched by the deletion.
            expect(deleted.body.totals).toEqual(renamed.body.totals);
        });

        it('a product deleted and re-created under the same name (another case) is one row with the new id', async () => {
            const aliceId = await ensureUser(ALICE);
            const first = await createProduct(ALICE, { name: 'Trufa', price: 3 });
            await seedAtNoon(aliceId, '2026-05-04', 300, { name: 'Trufa', quantity: 5, productId: first });
            await http().delete(`/api/products/${first}`).set(authAs(ALICE)).expect(HttpStatus.NO_CONTENT);

            const second = await createProduct(ALICE, { name: 'TRUFA', price: 3.5 });
            await seedAtNoon(aliceId, '2026-05-05', 350, { name: 'TRUFA', quantity: 5, productId: second });

            const response = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);

            // 5 × 3.00 + 5 × 3.50, each at its historical price.
            expect(response.body.topProducts).toEqual([
                { productId: second, productName: 'TRUFA', quantity: 10, revenue: 32.5 },
            ]);
        });

        it('a deleted product sold under two spellings is one row, named after the most recent sale', async () => {
            const aliceId = await ensureUser(ALICE);
            await seedAtNoon(aliceId, '2026-05-04', 800, { name: 'brownie', quantity: 2 });
            await seedAtNoon(aliceId, '2026-05-09', 800, { name: 'Brownie', quantity: 1 });

            const response = await metrics(ALICE, '?year=2026').expect(HttpStatus.OK);

            expect(response.body.topProducts).toEqual([
                { productId: null, productName: 'Brownie', quantity: 3, revenue: 24 },
            ]);
        });
    });

    describe('profit with the cost stored on each sale', () => {
        it('uses the cost of the time of each sale, whatever happens to the product afterwards', async () => {
            const aliceId = await ensureUser(ALICE);
            const productId = await createProduct(ALICE, { name: 'Brigadeiro', price: 3, preparationCost: 1 });
            const sell = (quantity: number, date: string) =>
                http()
                    .post('/api/sales')
                    .set(authAs(ALICE))
                    .send({ productId, quantity, date })
                    .expect(HttpStatus.CREATED);

            // April: 100 × 3.00 at cost 1.00 → revenue 300, cost 100.
            await sell(100, '2026-04-10');
            await http()
                .patch(`/api/products/${productId}`)
                .set(authAs(ALICE))
                .send({ preparationCost: 1.2 })
                .expect(HttpStatus.OK);
            // May: 100 × 3.00 at cost 1.20 → revenue 300, cost 120.
            await sell(100, '2026-05-10');
            // June: 10 × 3.00 recorded without a cost → all of it is revenue without cost.
            await seedAtNoon(aliceId, '2026-06-10', 300, { quantity: 10 });
            // July: 2 × 3.00 with the cost typed as 25.00 → a loss of 44.00.
            await seedAtNoon(aliceId, '2026-07-10', 300, { quantity: 2, costCents: 2500 });
            // December 19th, still in the future (today is November 5th): 300 × 5.00 at cost 2.00.
            await seedAtNoon(aliceId, '2026-12-19', 500, { quantity: 300, costCents: 200, name: 'Encomenda' });

            const expectedMonths = months({
                4: { revenue: 300, cost: 100, profit: 200, revenueWithoutCost: 0 },
                5: { revenue: 300, cost: 120, profit: 180, revenueWithoutCost: 0 },
                6: { revenue: 30, cost: 0, profit: 30, revenueWithoutCost: 30 },
                7: { revenue: 6, cost: 50, profit: -44, revenueWithoutCost: 0 },
                12: { revenue: 1500, cost: 600, profit: 900, revenueWithoutCost: 0 },
            });
            // 300 + 300 + 30 + 6 + 1500 and 100 + 120 + 0 + 50 + 600.
            const expectedAnnual = { revenue: 2136, cost: 870, profit: 1266, revenueWithoutCost: 30 };

            const before = await metrics(ALICE).expect(HttpStatus.OK);
            expect(before.body.monthlyProfit).toEqual(expectedMonths);
            expect(before.body.annualProfit).toEqual(expectedAnnual);
            expect(before.body.totals).toMatchObject(expectedAnnual);

            // Neither a new cost nor the deletion of the product re-costs what was already sold.
            await http()
                .patch(`/api/products/${productId}`)
                .set(authAs(ALICE))
                .send({ preparationCost: 2.9 })
                .expect(HttpStatus.OK);
            await http().delete(`/api/products/${productId}`).set(authAs(ALICE)).expect(HttpStatus.NO_CONTENT);

            const after = await metrics(ALICE).expect(HttpStatus.OK);
            expect(after.body.monthlyProfit).toEqual(expectedMonths);
            expect(after.body.annualProfit).toEqual(expectedAnnual);
        });
    });

    describe('year and month bounds, through the real service', () => {
        it.each([
            ['?year=2000', '2000-01-01', '2000-12-31'],
            ['?year=9998', '9998-01-01', '9998-12-31'],
            ['?year=9998&month=12', '9998-12-01', '9998-12-31'],
        ])('200 with zeros for %s', async (query, startDate, endDate) => {
            const response = await metrics(ALICE, query).expect(HttpStatus.OK);

            expect(response.body.period).toEqual({ startDate, endDate });
            expect(response.body.annualProfit).toEqual(ZERO_PROFIT);
            expect(response.body.monthlyProfit).toHaveLength(12);
        });

        it.each([
            ['year=1999', 'year', 'Deve ser maior ou igual a 2000.'],
            ['year=9999', 'year', 'Deve ser menor ou igual a 9998.'],
            ['month=13', 'month', 'Deve ser menor ou igual a 12.'],
            ['weeks=8', 'weeks', 'Campo não permitido.'],
        ])('400 VALIDATION_ERROR for %s', async (query, field, message) => {
            const response = await metrics(ALICE, `?${query}`).expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field, message }],
                },
            });
        });

        it('401 without a token', async () => {
            await http().get('/api/dashboard/metrics').expect(HttpStatus.UNAUTHORIZED);
        });

        it('the sales list also accepts the last supported day as the end of a range (it used to be a 500)', async () => {
            const aliceId = await ensureUser(ALICE);
            await seedAtNoon(aliceId, '2026-11-03', 300);

            const ranged = await http()
                .get('/api/sales?startDate=2026-01-01&endDate=9998-12-31')
                .set(authAs(ALICE))
                .expect(HttpStatus.OK);
            expect(ranged.body.items).toHaveLength(1);

            await http().get('/api/sales?date=9998-12-31').set(authAs(ALICE)).expect(HttpStatus.OK);
            await http().get('/api/sales?endDate=9999-01-01').set(authAs(ALICE)).expect(HttpStatus.BAD_REQUEST);
        });
    });
});
