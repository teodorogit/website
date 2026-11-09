import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { user_id } from '@/modules/users/test/utils/test.utils';
import { DashboardPrismaMapper } from '../mapper/dashboard-prisma.mapper';
import { DashboardPrismaRepository } from '../repository/dashboard-prisma.repository';

const prismaMock = {
    $queryRaw: jest.fn(),
    salesGoal: { findUnique: jest.fn() },
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
});
