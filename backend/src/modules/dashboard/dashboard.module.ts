import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import { DASHBOARD_MAPPER, DashboardPrismaMapper } from './mapper/dashboard-prisma.mapper';
import { DashboardPrismaRepository } from './repository/dashboard-prisma.repository';
import { DASHBOARD_REPOSITORY } from './repository/dashboard.repository';

@Module({
    imports: [PrismaModule],
    controllers: [DashboardController],
    providers: [
        { provide: DASHBOARD_MAPPER, useClass: DashboardPrismaMapper },
        {
            provide: DASHBOARD_REPOSITORY,
            useFactory: (prismaService: PrismaService, mapper: DashboardPrismaMapper) =>
                new DashboardPrismaRepository(prismaService, mapper),
            inject: [PrismaService, DASHBOARD_MAPPER],
        },
        DashboardService,
    ],
})
export class DashboardModule {}
