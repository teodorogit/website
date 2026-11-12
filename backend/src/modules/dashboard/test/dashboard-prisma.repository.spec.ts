import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { user_id } from '@/modules/users/test/utils/test.utils';
import { DashboardPrismaMapper } from '../mapper/dashboard-prisma.mapper';
import { DashboardPrismaRepository } from '../repository/dashboard-prisma.repository';

const prismaMock = {
    $queryRaw: jest.fn(),
    salesGoal: { findUnique: jest.fn() },
    sale: { findFirst: jest.fn() },
};

/** The `Prisma.sql` object handed to `$queryRaw`: `text` has `$n` placeholders, `values` the bound parameters. */
const queryAt = (index: number): Prisma.Sql => {
    const call = prismaMock.$queryRaw.mock.calls[index] as [Prisma.Sql] | undefined;
    const query = call?.[0];
    if (typeof query?.text !== 'string' || !Array.isArray(query.values)) {
        throw new Error('expected $queryRaw to receive a Prisma.sql template');
    }
    return query;
};

describe('DashboardPrismaRepository', () => {
    const scope = { user_id };
    let repository: DashboardPrismaRepository;

    beforeEach(() => {
        jest.resetAllMocks();
        repository = new DashboardPrismaRepository(prismaMock as unknown as PrismaService, new DashboardPrismaMapper());
    });

    describe('findSalesGoalCents', () => {
        it("reads only the user's goal", async () => {
            prismaMock.salesGoal.findUnique.mockResolvedValueOnce({ amount_cents: 100000 });

            await expect(repository.findSalesGoalCents(scope)).resolves.toBe(100000);
            expect(prismaMock.salesGoal.findUnique).toHaveBeenCalledWith({
                where: { user_id },
                select: { amount_cents: true },
            });
        });

        it('returns null when the user has no goal', async () => {
            prismaMock.salesGoal.findUnique.mockResolvedValueOnce(null);

            await expect(repository.findSalesGoalCents(scope)).resolves.toBeNull();
        });
    });

    describe('sumSoldCents', () => {
        it('sums quantity × historical unit price over all of the user’s sales, with user_id bound as a parameter', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([{ total_cents: 45000n }]);

            await expect(repository.sumSoldCents(scope)).resolves.toBe(45000);

            const query = queryAt(0);
            expect(query.values).toEqual([user_id]);
            expect(query.text).toContain('FROM sales s');
            expect(query.text).toContain('s.user_id = $1::uuid');
            expect(query.text).toContain('SUM(s.unit_price_cents::bigint * s.quantity)');
            expect(query.text).not.toContain(user_id);
            // All-time: no date restriction.
            expect(query.text).not.toContain('occurred_at');
        });

        it('returns 0 when the aggregate comes back empty', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([]);

            await expect(repository.sumSoldCents(scope)).resolves.toBe(0);
        });
    });

    describe('sumWeeklySalesCents', () => {
        const range = { start: new Date('2026-09-07T03:00:00.000Z'), end: new Date('2026-11-02T03:00:00.000Z') };

        it('buckets by local week with user_id, timezone and range all bound as parameters', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([]);

            await repository.sumWeeklySalesCents(scope, range, 'America/Sao_Paulo');

            const query = queryAt(0);
            expect(query.values).toEqual(['America/Sao_Paulo', user_id, range.start, range.end]);
            expect(query.text).toContain("date_trunc('week', s.occurred_at AT TIME ZONE $1)");
            expect(query.text).toContain('s.user_id = $2::uuid');
            expect(query.text).toContain('s.occurred_at >= $3::timestamptz');
            expect(query.text).toContain('s.occurred_at < $4::timestamptz');
            expect(query.text).not.toContain(user_id);
            expect(query.text).not.toContain('America/Sao_Paulo');
        });

        it('maps rows to weekly totals with integer cents and the Sunday week end', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([
                { week_start: '2026-09-14', total_cents: 2500n },
                { week_start: '2026-10-26', total_cents: 600n },
            ]);

            const weeks = await repository.sumWeeklySalesCents(scope, range, 'America/Sao_Paulo');

            expect(weeks.map((w) => ({ ...w }))).toEqual([
                { week_start: '2026-09-14', week_end: '2026-09-20', total_cents: 2500 },
                { week_start: '2026-10-26', week_end: '2026-11-01', total_cents: 600 },
            ]);
        });
    });

    describe('sumDailySales', () => {
        const range = { start: new Date('2026-01-01T03:00:00.000Z'), end: new Date('2027-01-01T03:00:00.000Z') };

        it('buckets by local day with timezone, user_id and range all bound as parameters', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([]);

            await expect(repository.sumDailySales(scope, range, 'America/Sao_Paulo')).resolves.toEqual([]);

            const query = queryAt(0);
            expect(query.values).toEqual(['America/Sao_Paulo', user_id, range.start, range.end]);
            expect(query.text).toContain("to_char(s.occurred_at AT TIME ZONE $1, 'YYYY-MM-DD') AS day");
            expect(query.text).toContain('s.user_id = $2::uuid');
            expect(query.text).toContain('s.occurred_at >= $3::timestamptz');
            expect(query.text).toContain('s.occurred_at < $4::timestamptz');
            expect(query.text).toContain('SUM(s.unit_price_cents::bigint * s.quantity)::bigint AS revenue_cents');
            expect(query.text).toContain('SUM(s.unit_cost_cents::bigint * s.quantity)::bigint AS cost_cents');
            expect(query.text).toContain('FILTER (WHERE s.unit_cost_cents = 0)');
            expect(query.text).not.toContain(user_id);
            expect(query.text).not.toContain('America/Sao_Paulo');
        });

        it('maps every bigint aggregate to a number', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([
                {
                    day: '2026-11-05',
                    revenue_cents: 2500n,
                    cost_cents: 900n,
                    uncosted_revenue_cents: 300n,
                    quantity: 7n,
                    sales_count: 3n,
                },
            ]);

            const days = await repository.sumDailySales(scope, range, 'America/Sao_Paulo');

            expect(days.map((day) => ({ ...day }))).toEqual([
                {
                    day: '2026-11-05',
                    revenue_cents: 2500,
                    cost_cents: 900,
                    uncosted_revenue_cents: 300,
                    quantity: 7,
                    sales_count: 3,
                },
            ]);
            // The response is JSON: a bigint left behind would throw on serialization.
            expect(() => JSON.stringify(days)).not.toThrow();
        });

        it('rejects an aggregate beyond the safe integer range instead of rounding it', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([
                {
                    day: '2026-11-05',
                    revenue_cents: 9007199254740993n,
                    cost_cents: 0n,
                    uncosted_revenue_cents: 0n,
                    quantity: 1n,
                    sales_count: 1n,
                },
            ]);

            await expect(repository.sumDailySales(scope, range, 'America/Sao_Paulo')).rejects.toThrow(RangeError);
        });
    });

    describe('findTopProducts', () => {
        const range = { start: new Date('2026-11-01T03:00:00.000Z'), end: new Date('2026-12-01T03:00:00.000Z') };

        it('ranks by units, revenue and name with user_id, range and limit bound as parameters', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([]);

            await expect(repository.findTopProducts(scope, range, 5)).resolves.toEqual([]);

            const query = queryAt(0);
            expect(query.values).toEqual([user_id, range.start, range.end, 5]);
            expect(query.text).toContain('s.user_id = $1::uuid');
            expect(query.text).toContain('s.occurred_at >= $2::timestamptz');
            expect(query.text).toContain('s.occurred_at < $3::timestamptz');
            expect(query.text).toContain('LIMIT $4');
            // The catalog join can only ever match a product of the same user.
            expect(query.text).toContain('LEFT JOIN products p ON p.id = s.product_id AND p.user_id = s.user_id');
            expect(query.text).toContain('GROUP BY lower(COALESCE(p.name::text, s.product_name_snapshot))');
            expect(query.text).toContain(
                'ORDER BY 3 DESC, 4 DESC, lower(COALESCE(p.name::text, s.product_name_snapshot)) ASC',
            );
            expect(query.text).not.toContain(user_id);
        });

        it('maps rows, keeping a null product_id for products that no longer exist', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([
                { product_id: 'p-1', product_name: 'Brigadeiro', quantity: 40n, revenue_cents: 12000n },
                { product_id: null, product_name: 'Brownie', quantity: 3n, revenue_cents: 2400n },
            ]);

            const products = await repository.findTopProducts(scope, range, 5);

            expect(products.map((product) => ({ ...product }))).toEqual([
                { product_id: 'p-1', product_name: 'Brigadeiro', quantity: 40, revenue_cents: 12000 },
                { product_id: null, product_name: 'Brownie', quantity: 3, revenue_cents: 2400 },
            ]);
        });
    });

    describe('findFirstSaleAt', () => {
        it("reads the oldest of the user's own sales", async () => {
            const occurred_at = new Date('2025-03-14T15:00:00.000Z');
            prismaMock.sale.findFirst.mockResolvedValueOnce({ occurred_at });

            await expect(repository.findFirstSaleAt(scope)).resolves.toBe(occurred_at);
            expect(prismaMock.sale.findFirst).toHaveBeenCalledWith({
                where: { user_id },
                orderBy: { occurred_at: 'asc' },
                select: { occurred_at: true },
            });
        });

        it('returns null when the user has no sales', async () => {
            prismaMock.sale.findFirst.mockResolvedValueOnce(null);

            await expect(repository.findFirstSaleAt(scope)).resolves.toBeNull();
        });
    });
});
