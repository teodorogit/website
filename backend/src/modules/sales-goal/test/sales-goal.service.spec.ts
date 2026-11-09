import { Test } from '@nestjs/testing';
import { defaultAuthUser } from '@/modules/auth/test/utils/test.utils';
import { otherUser } from '@/modules/users/test/utils/test.utils';
import { SALES_GOAL_REPOSITORY } from '../repository/sales-goal.repository';
import { SalesGoalService } from '../sales-goal.service';
import { defaultSalesGoal, mockedSalesGoalRepository } from './utils/test.utils';

describe('SalesGoalService', () => {
    let service: SalesGoalService;
    const authUser = defaultAuthUser();

    beforeEach(async () => {
        jest.resetAllMocks();

        const moduleRef = await Test.createTestingModule({
            providers: [{ provide: SALES_GOAL_REPOSITORY, useValue: mockedSalesGoalRepository }, SalesGoalService],
        }).compile();

        service = moduleRef.get(SalesGoalService);
    });

    describe('findByUser', () => {
        it('returns the goal scoped to the authenticated user', async () => {
            const goal = defaultSalesGoal();
            mockedSalesGoalRepository.findByUser.mockResolvedValueOnce(goal);

            await expect(service.findByUser(authUser)).resolves.toBe(goal);
            expect(mockedSalesGoalRepository.findByUser).toHaveBeenCalledWith({ user_id: authUser.id });
        });

        it('returns null when the user has no goal', async () => {
            mockedSalesGoalRepository.findByUser.mockResolvedValueOnce(null);

            await expect(service.findByUser(authUser)).resolves.toBeNull();
        });

        it('scopes by whichever user is passed, never a fixed one', async () => {
            const other = defaultAuthUser(otherUser());
            mockedSalesGoalRepository.findByUser.mockResolvedValueOnce(null);

            await service.findByUser(other);

            expect(mockedSalesGoalRepository.findByUser).toHaveBeenCalledWith({ user_id: other.id });
        });
    });

    describe('upsert', () => {
        it('converts reais to integer cents and upserts within the user scope', async () => {
            const goal = defaultSalesGoal({ amount_cents: 123_456 });
            mockedSalesGoalRepository.upsert.mockResolvedValueOnce(goal);

            await expect(service.upsert(authUser, { amount: 1234.56 })).resolves.toBe(goal);
            expect(mockedSalesGoalRepository.upsert).toHaveBeenCalledWith({ user_id: authUser.id }, 123_456);
        });

        it('rounds binary-float noise to the nearest cent (0.29 reais = 29 cents)', async () => {
            mockedSalesGoalRepository.upsert.mockResolvedValueOnce(defaultSalesGoal({ amount_cents: 29 }));

            await service.upsert(authUser, { amount: 0.29 });

            expect(mockedSalesGoalRepository.upsert).toHaveBeenCalledWith({ user_id: authUser.id }, 29);
        });

        it('propagates repository failures', async () => {
            const failure = new Error('connection lost');
            mockedSalesGoalRepository.upsert.mockRejectedValueOnce(failure);

            await expect(service.upsert(authUser, { amount: 10 })).rejects.toBe(failure);
        });
    });
});
