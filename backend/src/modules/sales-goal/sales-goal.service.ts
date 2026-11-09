import { Inject, Injectable } from '@nestjs/common';
import { reaisToCents } from '@/common/utils/money.util';
import { AuthUser } from '@/modules/auth/auth-user';
import { UpsertSalesGoalDto } from './dto/upsert-sales-goal.dto';
import { SalesGoal } from './entities/sales-goal.entity';
import { SALES_GOAL_REPOSITORY, SalesGoalRepository } from './repository/sales-goal.repository';

@Injectable()
export class SalesGoalService {
    constructor(
        @Inject(SALES_GOAL_REPOSITORY)
        private readonly salesGoalRepository: SalesGoalRepository,
    ) {}

    /** `null` when the user never set a goal: GET answers 200 with nulls and the dashboard shows no goal. */
    findByUser(user: AuthUser): Promise<SalesGoal | null> {
        return this.salesGoalRepository.findByUser({ user_id: user.id });
    }

    upsert(user: AuthUser, dto: UpsertSalesGoalDto): Promise<SalesGoal> {
        return this.salesGoalRepository.upsert({ user_id: user.id }, reaisToCents(dto.amount));
    }
}
