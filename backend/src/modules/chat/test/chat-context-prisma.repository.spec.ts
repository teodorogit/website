import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { user_id } from '@/modules/users/test/utils/test.utils';
import { SalesWindows } from '../entities/chat-context.entity';
import { ChatContextPrismaMapper, ProductSalesSummaryRow } from '../mapper/chat-context-prisma.mapper';
import { ChatContextPrismaRepository } from '../repository/chat-context-prisma.repository';
import { product_id } from './utils/test.utils';

const prismaMock = {
    product: { findMany: jest.fn() },
    sale: { findMany: jest.fn() },
    salesGoal: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
};

const scope = { user_id };

const windows: SalesWindows = {
    today: { start: new Date('2026-11-04T03:00:00.000Z'), end: new Date('2026-11-05T03:00:00.000Z') },
    last_7_days: { start: new Date('2026-10-29T03:00:00.000Z'), end: new Date('2026-11-05T03:00:00.000Z') },
    last_30_days: { start: new Date('2026-10-06T03:00:00.000Z'), end: new Date('2026-11-05T03:00:00.000Z') },
};

describe('ChatContextPrismaRepository', () => {
    let repository: ChatContextPrismaRepository;

    beforeEach(() => {
        jest.resetAllMocks();
        repository = new ChatContextPrismaRepository(
            prismaMock as unknown as PrismaService,
            new ChatContextPrismaMapper(),
        );
    });

    it('lists only the user products, ordered by name', async () => {
        const updated_at = new Date('2026-10-01T12:00:00.000Z');
        prismaMock.product.findMany.mockResolvedValueOnce([
            { id: product_id, name: 'Brigadeiro', price_cents: 300, preparation_cost_cents: 50, updated_at },
        ]);

        const products = await repository.listProducts(scope);

        expect(prismaMock.product.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { user_id }, orderBy: [{ name: 'asc' }, { id: 'asc' }] }),
        );
        expect(products).toEqual([
            { id: product_id, name: 'Brigadeiro', price_cents: 300, preparation_cost_cents: 50, updated_at },
        ]);
    });

    it('lists only the user recent sales, newest first', async () => {
        prismaMock.sale.findMany.mockResolvedValueOnce([]);

        await repository.listRecentSales(scope, 10);

        expect(prismaMock.sale.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { user_id },
                orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
                take: 10,
            }),
        );
    });

    it('reads the goal by user and returns cents or null', async () => {
        prismaMock.salesGoal.findUnique.mockResolvedValueOnce({ amount_cents: 100_000 }).mockResolvedValueOnce(null);

        await expect(repository.findSalesGoalCents(scope)).resolves.toBe(100_000);
        await expect(repository.findSalesGoalCents(scope)).resolves.toBeNull();
        expect(prismaMock.salesGoal.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { user_id } }));
    });

    describe('summarizeSalesByProduct', () => {
        it('filters by user_id with a bound parameter (never interpolated SQL) and binds every window', async () => {
            prismaMock.$queryRaw.mockResolvedValueOnce([]);

            await repository.summarizeSalesByProduct(scope, windows);

            const [query] = prismaMock.$queryRaw.mock.calls[0] as [Prisma.Sql];
            expect(query.text).toMatch(/WHERE user_id = \$\d+::uuid/);
            expect(query.text).not.toContain(user_id);
            expect(query.values).toContain(user_id);
            for (const range of Object.values(windows)) {
                expect(query.values).toContain(range.start);
                expect(query.values).toContain(range.end);
            }
            expect(query.sql).toContain('SUM(unit_price_cents::bigint * quantity)');
        });

        it('maps bigint/Decimal/NULL aggregates to integer totals', async () => {
            const row: ProductSalesSummaryRow = {
                product_id: null,
                removed_product_name: 'Cookie',
                sales_count: 3n,
                units: 7n,
                revenue_cents: new Prisma.Decimal('4200'),
                sales_count_30d: 1n,
                units_30d: 2n,
                revenue_cents_30d: new Prisma.Decimal('1200'),
                sales_count_7d: 0n,
                units_7d: null,
                revenue_cents_7d: null,
                sales_count_today: 0n,
                units_today: null,
                revenue_cents_today: null,
                first_sale_at: new Date('2026-09-01T15:00:00.000Z'),
                last_sale_at: new Date('2026-10-20T15:00:00.000Z'),
            };
            prismaMock.$queryRaw.mockResolvedValueOnce([row]);

            const [summary] = await repository.summarizeSalesByProduct(scope, windows);

            expect(summary).toEqual({
                product_id: null,
                removed_product_name: 'Cookie',
                all_time: { sales_count: 3, units: 7, revenue_cents: 4200 },
                last_30_days: { sales_count: 1, units: 2, revenue_cents: 1200 },
                last_7_days: { sales_count: 0, units: 0, revenue_cents: 0 },
                today: { sales_count: 0, units: 0, revenue_cents: 0 },
                first_sale_at: row.first_sale_at,
                last_sale_at: row.last_sale_at,
            });
        });
    });
});
