import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { SALE_MAPPER, SalePrismaMapper } from './mapper/sale-prisma.mapper';
import { SalePrismaRepository } from './repository/sale-prisma.repository';
import { SALE_REPOSITORY } from './repository/sale.repository';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
    imports: [PrismaModule],
    controllers: [SalesController],
    providers: [
        { provide: SALE_MAPPER, useClass: SalePrismaMapper },
        {
            provide: SALE_REPOSITORY,
            useFactory: (prismaService: PrismaService, mapper: SalePrismaMapper) =>
                new SalePrismaRepository(prismaService, mapper),
            inject: [PrismaService, SALE_MAPPER],
        },
        SalesService,
    ],
})
export class SalesModule {}
