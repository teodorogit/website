import { Prisma } from '@prisma/client';
import { UserScope } from '@/common/repository/repository';
import { isRecordNotFoundError } from '@/infrastructure/prisma/prisma-errors';
import { PrismaService, PrismaTransactionClient } from '@/infrastructure/prisma/prisma.service';
import { Sale } from '../entities/sale.entity';
import { SalePrismaMapper } from '../mapper/sale-prisma.mapper';
import { ProductSnapshot, SaleChanges, SaleListQuery, SaleRepository } from './sale.repository';

export class SalePrismaRepository implements SaleRepository {
    constructor(
        private readonly prismaService: PrismaService,
        private readonly saleMapper: SalePrismaMapper,
        /** Set only on the repository handed to `transaction` callbacks. */
        private readonly transactionClient?: PrismaTransactionClient,
    ) {}

    private get db(): PrismaTransactionClient {
        return this.transactionClient ?? this.prismaService;
    }

    async transaction<T>(work: (repository: SaleRepository) => Promise<T>): Promise<T> {
        // Prisma has no nested interactive transactions: join the open one instead.
        if (this.transactionClient) {
            return work(this);
        }

        return this.prismaService.$transaction((tx) =>
            work(new SalePrismaRepository(this.prismaService, this.saleMapper, tx)),
        );
    }

    async findMany(scope: UserScope, query: SaleListQuery): Promise<Sale[]> {
        const { occurred_from, occurred_before, after } = query;

        const where: Prisma.SaleWhereInput = {
            user_id: scope.user_id,
            ...((occurred_from || occurred_before) && {
                occurred_at: {
                    ...(occurred_from && { gte: occurred_from }),
                    ...(occurred_before && { lt: occurred_before }),
                },
            }),
            ...(after && {
                OR: [
                    { occurred_at: { lt: after.occurred_at } },
                    { occurred_at: after.occurred_at, id: { lt: after.id } },
                ],
            }),
        };

        const rows = await this.db.sale.findMany({
            where,
            orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
            ...(query.take !== undefined && { take: query.take }),
        });

        return rows.map((row) => this.saleMapper.mapToEntity(row));
    }

    async findById(scope: UserScope, id: string): Promise<Sale | null> {
        const row = await this.db.sale.findFirst({ where: { id, user_id: scope.user_id } });
        return row ? this.saleMapper.mapToEntity(row) : null;
    }

    async lockProductForSnapshot(scope: UserScope, productId: string): Promise<ProductSnapshot | null> {
        // FOR SHARE makes a concurrent DELETE (FK race on insert) or price UPDATE wait until we
        // commit, so the snapshot always matches the committed catalog row it references.
        // Casts: Prisma binds strings as text, and raw reads don't deserialize citext.
        const rows = await this.db.$queryRaw<ProductSnapshot[]>`
            SELECT id::text AS id, name::text AS name, price_cents
            FROM products
            WHERE id = ${productId}::uuid AND user_id = ${scope.user_id}::uuid
            FOR SHARE`;

        return rows[0] ?? null;
    }

    async insert(scope: UserScope, sale: Sale): Promise<Sale> {
        const row = await this.db.sale.create({
            data: { ...this.saleMapper.mapFromEntity(sale), user_id: scope.user_id },
        });

        return this.saleMapper.mapToEntity(row);
    }

    async update(scope: UserScope, id: string, changes: SaleChanges): Promise<Sale | null> {
        try {
            const row = await this.db.sale.update({ where: { id, user_id: scope.user_id }, data: changes });
            return this.saleMapper.mapToEntity(row);
        } catch (error) {
            if (isRecordNotFoundError(error)) {
                return null;
            }

            throw error;
        }
    }

    async delete(scope: UserScope, id: string): Promise<boolean> {
        const { count } = await this.db.sale.deleteMany({ where: { id, user_id: scope.user_id } });
        return count > 0;
    }
}
