import { Module } from '@nestjs/common';
import { PrismaModule } from '@/infrastructure/prisma/prisma.module';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { PRODUCT_MAPPER, ProductPrismaMapper } from './mapper/product-prisma.mapper';
import { ProductPrismaRepository } from './repository/product-prisma.repository';
import { PRODUCT_REPOSITORY } from './repository/product.repository';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
    imports: [PrismaModule],
    controllers: [ProductsController],
    providers: [
        { provide: PRODUCT_MAPPER, useClass: ProductPrismaMapper },
        {
            provide: PRODUCT_REPOSITORY,
            useFactory: (prismaService: PrismaService, mapper: ProductPrismaMapper) =>
                new ProductPrismaRepository(prismaService, mapper),
            inject: [PrismaService, PRODUCT_MAPPER],
        },
        ProductsService,
    ],
    exports: [ProductsService],
})
export class ProductsModule {}
