import { Product as ProductPrisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { other_user_id, user_id } from '@/modules/users/test/utils/test.utils';
import { Product } from '../entities/product.entity';
import { ProductPrismaMapper } from '../mapper/product-prisma.mapper';
import { ProductPrismaRepository } from '../repository/product-prisma.repository';
import { defaultProduct, product_id } from './utils/test.utils';

const row = (overrides: Partial<ProductPrisma> = {}): ProductPrisma => ({
    ...new ProductPrismaMapper().mapFromEntity(defaultProduct()),
    ...overrides,
});

const prismaMock = {
    product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        count: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
    },
    $executeRaw: jest.fn(),
    // Interactive transactions run the callback with a client; the same mock stands in for it.
    $transaction: jest.fn(),
};

describe('ProductPrismaRepository', () => {
    let repository: ProductPrismaRepository;
    const scope = { user_id };

    beforeEach(() => {
        jest.resetAllMocks();
        prismaMock.$transaction.mockImplementation(async (callback: (tx: typeof prismaMock) => unknown) =>
            callback(prismaMock),
        );

        repository = new ProductPrismaRepository(prismaMock as unknown as PrismaService, new ProductPrismaMapper());
    });

    describe('findMany', () => {
        it('filters by the user and orders by name, mapping rows to entities', async () => {
            prismaMock.product.findMany.mockResolvedValueOnce([row()]);

            const products = await repository.findMany(scope);

            expect(prismaMock.product.findMany).toHaveBeenCalledWith({ where: { user_id }, orderBy: { name: 'asc' } });
            expect(products).toEqual([defaultProduct()]);
            expect(products[0]).toBeInstanceOf(Product);
        });
    });

    describe('findById', () => {
        it('filters by id AND user', async () => {
            prismaMock.product.findFirst.mockResolvedValueOnce(row());

            await expect(repository.findById(product_id, scope)).resolves.toEqual(defaultProduct());
            expect(prismaMock.product.findFirst).toHaveBeenCalledWith({ where: { id: product_id, user_id } });
        });

        it("returns null for another user's product (filtered out by user_id)", async () => {
            prismaMock.product.findFirst.mockResolvedValueOnce(null);

            await expect(repository.findById(product_id, { user_id: other_user_id })).resolves.toBeNull();
            expect(prismaMock.product.findFirst).toHaveBeenCalledWith({
                where: { id: product_id, user_id: other_user_id },
            });
        });
    });

    describe('insert', () => {
        it('takes the owner from the scope, not from the entity', async () => {
            prismaMock.product.count.mockResolvedValueOnce(0);
            prismaMock.product.create.mockResolvedValueOnce(row());
            const product = defaultProduct({ user_id: other_user_id });

            await expect(repository.insert(product, scope, 500)).resolves.toEqual(defaultProduct());

            expect(prismaMock.product.create).toHaveBeenCalledWith({
                data: {
                    id: product.id,
                    user_id,
                    name: product.name,
                    price_cents: product.price_cents,
                    preparation_cost_cents: product.preparation_cost_cents,
                    created_at: product.created_at,
                    updated_at: product.updated_at,
                },
            });
        });

        it("locks the owner's row, then counts only the user's products, inside one transaction", async () => {
            prismaMock.product.count.mockResolvedValueOnce(499);
            prismaMock.product.create.mockResolvedValueOnce(row());

            await repository.insert(defaultProduct(), scope, 500);

            expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
            const [sql, lockedUserId] = prismaMock.$executeRaw.mock.calls[0] as [TemplateStringsArray, string];
            expect(sql.join('?')).toMatch(/FROM users WHERE id = \?::uuid FOR NO KEY UPDATE/);
            expect(lockedUserId).toBe(user_id);
            expect(prismaMock.product.count).toHaveBeenCalledWith({ where: { user_id } });
            expect(prismaMock.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
                prismaMock.product.count.mock.invocationCallOrder[0] ?? 0,
            );
        });

        it('returns null without inserting once the user owns maxProducts products', async () => {
            prismaMock.product.count.mockResolvedValueOnce(500);

            await expect(repository.insert(defaultProduct(), scope, 500)).resolves.toBeNull();
            expect(prismaMock.product.create).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        it('updates by id AND user inside a transaction and returns the re-read row', async () => {
            prismaMock.product.updateMany.mockResolvedValueOnce({ count: 1 });
            prismaMock.product.findFirst.mockResolvedValueOnce(row({ price_cents: 450 }));

            const updated = await repository.update(product_id, { price_cents: 450 }, scope);

            expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
            expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
                where: { id: product_id, user_id },
                data: { price_cents: 450 },
            });
            expect(prismaMock.product.findFirst).toHaveBeenCalledWith({ where: { id: product_id, user_id } });
            expect(updated?.price_cents).toBe(450);
        });

        it("returns null without re-reading when nothing of the user's matched", async () => {
            prismaMock.product.updateMany.mockResolvedValueOnce({ count: 0 });

            await expect(
                repository.update(product_id, { name: 'Bombom' }, { user_id: other_user_id }),
            ).resolves.toBeNull();
            expect(prismaMock.product.updateMany).toHaveBeenCalledWith({
                where: { id: product_id, user_id: other_user_id },
                data: { name: 'Bombom' },
            });
            expect(prismaMock.product.findFirst).not.toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        it('deletes by id AND user only (sales are kept by the FK ON DELETE SET NULL)', async () => {
            prismaMock.product.deleteMany.mockResolvedValueOnce({ count: 1 });

            await expect(repository.delete(product_id, scope)).resolves.toBe(true);
            expect(prismaMock.product.deleteMany).toHaveBeenCalledWith({ where: { id: product_id, user_id } });
        });

        it("returns false when nothing of the user's matched", async () => {
            prismaMock.product.deleteMany.mockResolvedValueOnce({ count: 0 });

            await expect(repository.delete(product_id, { user_id: other_user_id })).resolves.toBe(false);
        });
    });
});
