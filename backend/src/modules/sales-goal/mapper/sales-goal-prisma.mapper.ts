import { Injectable } from '@nestjs/common';
import { SalesGoal as SalesGoalPrisma } from '@prisma/client';
import { Mapper } from '@/common/mapper/mapper';
import { SalesGoal } from '../entities/sales-goal.entity';

export const SALES_GOAL_MAPPER = 'SalesGoalMapper';

@Injectable()
export class SalesGoalPrismaMapper implements Mapper<SalesGoalPrisma, SalesGoal> {
    mapFromEntity(goal: SalesGoal): SalesGoalPrisma {
        return {
            id: goal.id,
            user_id: goal.user_id,
            amount_cents: goal.amount_cents,
            created_at: goal.created_at,
            updated_at: goal.updated_at,
        };
    }

    mapToEntity(row: SalesGoalPrisma): SalesGoal {
        return new SalesGoal({
            id: row.id,
            user_id: row.user_id,
            amount_cents: row.amount_cents,
            created_at: row.created_at,
            updated_at: row.updated_at,
        });
    }
}
