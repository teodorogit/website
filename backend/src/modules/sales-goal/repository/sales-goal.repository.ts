import { UserScope } from '@/common/repository/repository';
import { SalesGoal } from '../entities/sales-goal.entity';

export const SALES_GOAL_REPOSITORY = 'SalesGoalRepository';

export interface SalesGoalRepository {
    findByUser(scope: UserScope): Promise<SalesGoal | null>;

    /** Creates the user's goal or replaces its amount in one atomic statement (one goal per user). */
    upsert(scope: UserScope, amount_cents: number): Promise<SalesGoal>;
}
