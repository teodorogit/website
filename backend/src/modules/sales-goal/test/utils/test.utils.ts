import { JestMock } from '@/common/types/types';
import { user_id } from '@/modules/users/test/utils/test.utils';
import { SalesGoal } from '../../entities/sales-goal.entity';
import { SalesGoalRepository } from '../../repository/sales-goal.repository';
import { SalesGoalService } from '../../sales-goal.service';

export const sales_goal_id = '22222222-2222-4222-8222-222222222222';

export const mockedSalesGoalService: JestMock<SalesGoalService> = {
    findByUser: jest.fn(),
    upsert: jest.fn(),
};

export const mockedSalesGoalRepository: JestMock<SalesGoalRepository> = {
    findByUser: jest.fn(),
    upsert: jest.fn(),
};

export const defaultSalesGoal = (overrides: Partial<SalesGoal> = {}): SalesGoal =>
    new SalesGoal({
        id: sales_goal_id,
        user_id,
        amount_cents: 100_000,
        created_at: new Date('2026-10-01T12:00:00.000Z'),
        updated_at: new Date('2026-10-24T12:00:00.000Z'),
        ...overrides,
    });
