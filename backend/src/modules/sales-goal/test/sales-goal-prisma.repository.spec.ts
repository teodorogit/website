import { SalesGoal as SalesGoalPrisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { other_user_id, user_id } from '@/modules/users/test/utils/test.utils';
import { SalesGoal } from '../entities/sales-goal.entity';
import { SalesGoalPrismaMapper } from '../mapper/sales-goal-prisma.mapper';
import { SalesGoalPrismaRepository } from '../repository/sales-goal-prisma.repository';
import { sales_goal_id } from './utils/test.utils';

const prismaMock = {
    salesGoal: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
    },
};

const row = (overrides: Partial<SalesGoalPrisma> = {}): SalesGoalPrisma => ({
    id: sales_goal_id,
    user_id,
    amount_cents: 100_000,
    created_at: new Date('2026-10-01T12:00:00.000Z'),
    updated_at: new Date('2026-10-24T12:00:00.000Z'),
    ...overrides,
});

describe('SalesGoalPrismaRepository', () => {
    let repository: SalesGoalPrismaRepository;

    beforeEach(() => {
        jest.resetAllMocks();
        repository = new SalesGoalPrismaRepository(prismaMock as unknown as PrismaService, new SalesGoalPrismaMapper());
    });

    describe('findByUser', () => {
        it('filters by user_id and maps the row to an entity', async () => {
            prismaMock.salesGoal.findUnique.mockResolvedValueOnce(row());

            const goal = await repository.findByUser({ user_id });

            expect(prismaMock.salesGoal.findUnique).toHaveBeenCalledWith({ where: { user_id } });
            expect(goal).toBeInstanceOf(SalesGoal);
            expect(goal).toEqual(
                new SalesGoal({
                    id: sales_goal_id,
                    user_id,
                    amount_cents: 100_000,
                    created_at: new Date('2026-10-01T12:00:00.000Z'),
                    updated_at: new Date('2026-10-24T12:00:00.000Z'),
                }),
            );
        });

        it("returns null when the user has no goal (another user's goal is never looked up)", async () => {
            prismaMock.salesGoal.findUnique.mockResolvedValueOnce(null);

            await expect(repository.findByUser({ user_id: other_user_id })).resolves.toBeNull();
            expect(prismaMock.salesGoal.findUnique).toHaveBeenCalledWith({ where: { user_id: other_user_id } });
        });
    });

    describe('upsert', () => {
        it('upserts on the unique user_id with the same user in create and only the amount in update', async () => {
            prismaMock.salesGoal.upsert.mockResolvedValueOnce(row({ amount_cents: 250_050 }));

            const goal = await repository.upsert({ user_id }, 250_050);

            // Exactly this shape keeps Prisma on the native INSERT ... ON CONFLICT path (no read-then-write race).
            expect(prismaMock.salesGoal.upsert).toHaveBeenCalledWith({
                where: { user_id },
                create: { user_id, amount_cents: 250_050 },
                update: { amount_cents: 250_050 },
            });
            expect(goal).toBeInstanceOf(SalesGoal);
            expect(goal.amount_cents).toBe(250_050);
            expect(goal.user_id).toBe(user_id);
        });
    });
});

describe('SalesGoalPrismaMapper', () => {
    it('round-trips entity and row without losing fields', () => {
        const mapper = new SalesGoalPrismaMapper();
        const original = row();

        expect(mapper.mapFromEntity(mapper.mapToEntity(original))).toEqual(original);
    });
});
