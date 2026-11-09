import { Injectable } from '@nestjs/common';
import { UserScope } from '@/common/repository/repository';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { SalesGoal } from '../entities/sales-goal.entity';
import { SalesGoalPrismaMapper } from '../mapper/sales-goal-prisma.mapper';
import { SalesGoalRepository } from './sales-goal.repository';

@Injectable()
export class SalesGoalPrismaRepository implements SalesGoalRepository {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly salesGoalMapper: SalesGoalPrismaMapper,
    ) {}

    async findByUser(scope: UserScope): Promise<SalesGoal | null> {
        const row = await this.prismaService.salesGoal.findUnique({ where: { user_id: scope.user_id } });
        return row ? this.salesGoalMapper.mapToEntity(row) : null;
    }

    /**
     * `where` is the single unique `user_id`, `create` carries the same value and there are no
     * nested writes, so Prisma emits a native `INSERT ... ON CONFLICT (user_id) DO UPDATE`: two
     * concurrent first PUTs cannot both insert (no read-then-write race, no P2002 to retry).
     */
    async upsert(scope: UserScope, amount_cents: number): Promise<SalesGoal> {
        const row = await this.prismaService.salesGoal.upsert({
            where: { user_id: scope.user_id },
            create: { user_id: scope.user_id, amount_cents },
            update: { amount_cents },
        });

        return this.salesGoalMapper.mapToEntity(row);
    }
}
