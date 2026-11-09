import { Injectable } from '@nestjs/common';
import { UserScope } from '@/common/repository/repository';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { Product, ProductChanges } from '../entities/product.entity';
import { ProductPrismaMapper } from '../mapper/product-prisma.mapper';
import { ProductRepository } from './product.repository';

@Injectable()
export class ProductPrismaRepository implements ProductRepository {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly productMapper: ProductPrismaMapper,
    ) {}

    async findMany(scope: UserScope): Promise<Product[]> {
        const rows = await this.prismaService.product.findMany({
            where: { user_id: scope.user_id },
            orderBy: { name: 'asc' },
        });

        return rows.map((row) => this.productMapper.mapToEntity(row));
    }

    async findById(id: string, scope: UserScope): Promise<Product | null> {
        const row = await this.prismaService.product.findFirst({ where: { id, user_id: scope.user_id } });
        return row ? this.productMapper.mapToEntity(row) : null;
    }

    async insert(product: Product, scope: UserScope, maxProducts: number): Promise<Product | null> {
        return this.prismaService.$transaction(async (tx) => {
            // Locks the owner's row until commit, so concurrent inserts of the same user count one at a
            // time and cannot all pass the check below. NO KEY UPDATE does not block FK checks
            // (KEY SHARE) from sales or other tables referencing the user.
            await tx.$executeRaw`SELECT 1 FROM users WHERE id = ${scope.user_id}::uuid FOR NO KEY UPDATE`;

            const owned = await tx.product.count({ where: { user_id: scope.user_id } });
            if (owned >= maxProducts) {
                return null;
            }

            // The owner always comes from the scope, never from whatever the entity carries.
            const row = await tx.product.create({
                data: { ...this.productMapper.mapFromEntity(product), user_id: scope.user_id },
            });

            return this.productMapper.mapToEntity(row);
        });
    }

    async update(id: string, changes: ProductChanges, scope: UserScope): Promise<Product | null> {
        const where = { id, user_id: scope.user_id };

        // The row lock taken by updateMany lasts until commit, so the re-read cannot miss a row
        // that a concurrent DELETE would otherwise remove in between.
        return this.prismaService.$transaction(async (tx) => {
            const { count } = await tx.product.updateMany({ where, data: changes });
            if (count === 0) {
                return null;
            }

            const row = await tx.product.findFirst({ where });
            return row ? this.productMapper.mapToEntity(row) : null;
        });
    }

    async delete(id: string, scope: UserScope): Promise<boolean> {
        const { count } = await this.prismaService.product.deleteMany({ where: { id, user_id: scope.user_id } });
        return count > 0;
    }
}
