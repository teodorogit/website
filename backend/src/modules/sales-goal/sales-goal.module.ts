import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { SALES_GOAL_MAPPER, SalesGoalPrismaMapper } from './mapper/sales-goal-prisma.mapper';
import { SalesGoalPrismaRepository } from './repository/sales-goal-prisma.repository';
import { SALES_GOAL_REPOSITORY } from './repository/sales-goal.repository';
import { SalesGoalController } from './sales-goal.controller';
import { SalesGoalService } from './sales-goal.service';

@Module({
    imports: [PrismaModule],
    controllers: [SalesGoalController],
    providers: [
        { provide: SALES_GOAL_MAPPER, useClass: SalesGoalPrismaMapper },
        {
            provide: SALES_GOAL_REPOSITORY,
            useFactory: (prismaService: PrismaService, mapper: SalesGoalPrismaMapper) =>
                new SalesGoalPrismaRepository(prismaService, mapper),
            inject: [PrismaService, SALES_GOAL_MAPPER],
        },
        SalesGoalService,
    ],
    exports: [SalesGoalService],
})
export class SalesGoalModule {}
