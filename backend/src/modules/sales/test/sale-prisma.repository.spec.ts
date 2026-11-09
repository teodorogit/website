import { Prisma } from '@prisma/client';
import { PrismaService } from '@/infrastructure/prisma/prisma.service';
import { SalePrismaMapper } from '../mapper/sale-prisma.mapper';
import { SalePrismaRepository } from '../repository/sale-prisma.repository';
import { defaultSale, other_user_id, product_id, sale_id, user_id } from './utils/test.utils';

const scope = { user_id };

const createClient = () => ({
    sale: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        deleteMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
});

type Client = ReturnType<typeof createClient>;

const recordNotFound = () =>
    new Prisma.PrismaClientKnownRequestError('Record to update not found', { code: 'P2025', clientVersion: 'test' });

const rowOf = (overrides: Parameters<typeof defaultSale>[0] = {}) =>
    new SalePrismaMapper().mapFromEntity(defaultSale(overrides));

describe('SalePrismaRepository', () => {
    let prisma: Client & { $transaction: jest.Mock };
    let tx: Client;
    let repository: SalePrismaRepository;

    beforeEach(() => {
        tx = createClient();
        prisma = {
            ...createClient(),
            $transaction: jest.fn(async (work: (client: Client) => Promise<unknown>) => work(tx)),
        };
        repository = new SalePrismaRepository(prisma as unknown as PrismaService, new SalePrismaMapper());
    });

    describe('findMany', () => {
        it('always scopes by user_id and orders by occurred_at DESC, id DESC', async () => {
            prisma.sale.findMany.mockResolvedValueOnce([rowOf()]);

            const sales = await repository.findMany(scope, { take: 51 });

            expect(sales).toEqual([defaultSale()]);
            expect(prisma.sale.findMany).toHaveBeenCalledWith({
                where: { user_id },
                orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
                take: 51,
            });
        });

        it('applies the half-open range and the keyset position next to user_id', async () => {
            prisma.sale.findMany.mockResolvedValueOnce([]);
            const occurred_from = new Date('2026-10-24T03:00:00.000Z');
            const occurred_before = new Date('2026-10-25T03:00:00.000Z');
            const after = { occurred_at: new Date('2026-10-24T15:30:00.000Z'), id: sale_id };

            await repository.findMany(scope, { occurred_from, occurred_before, after, take: 3 });

            expect(prisma.sale.findMany).toHaveBeenCalledWith({
                where: {
                    user_id,
                    occurred_at: { gte: occurred_from, lt: occurred_before },
                    OR: [
                        { occurred_at: { lt: after.occurred_at } },
                        { occurred_at: after.occurred_at, id: { lt: sale_id } },
                    ],
                },
                orderBy: [{ occurred_at: 'desc' }, { id: 'desc' }],
                take: 3,
            });
        });

        it('supports a single open-ended bound', async () => {
            prisma.sale.findMany.mockResolvedValueOnce([]);
            const occurred_before = new Date('2026-11-01T03:00:00.000Z');

            await repository.findMany(scope, { occurred_before, take: 51 });

            expect(prisma.sale.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { user_id, occurred_at: { lt: occurred_before } } }),
            );
        });
    });

    describe('findById', () => {
        it('filters by id AND user_id', async () => {
            prisma.sale.findFirst.mockResolvedValueOnce(rowOf());

            await expect(repository.findById(scope, sale_id)).resolves.toEqual(defaultSale());
            expect(prisma.sale.findFirst).toHaveBeenCalledWith({ where: { id: sale_id, user_id } });
        });

        it('returns null when no row matches', async () => {
            prisma.sale.findFirst.mockResolvedValueOnce(null);

            await expect(repository.findById(scope, sale_id)).resolves.toBeNull();
        });
    });

    describe('lockProductForSnapshot', () => {
        it('reads the product with a parameterized, user-scoped FOR SHARE query', async () => {
            prisma.$queryRaw.mockResolvedValueOnce([{ id: product_id, name: 'Brigadeiro', price_cents: 300 }]);

            await expect(repository.lockProductForSnapshot(scope, product_id)).resolves.toEqual({
                id: product_id,
                name: 'Brigadeiro',
                price_cents: 300,
            });

            const [strings, ...values] = prisma.$queryRaw.mock.calls[0] as [TemplateStringsArray, ...unknown[]];
            const sql = strings.join('?').replace(/\s+/g, ' ');
            expect(sql).toContain('FROM products WHERE id = ?::uuid AND user_id = ?::uuid FOR SHARE');
            expect(values).toEqual([product_id, user_id]);
        });

        it('returns null when the product is missing or foreign', async () => {
            prisma.$queryRaw.mockResolvedValueOnce([]);

            await expect(repository.lockProductForSnapshot(scope, product_id)).resolves.toBeNull();
        });
    });

    describe('insert', () => {
        it('persists under the scope user, never the entity user_id', async () => {
            const sale = defaultSale({ user_id: other_user_id });
            prisma.sale.create.mockResolvedValueOnce(rowOf());

            await repository.insert(scope, sale);

            expect(prisma.sale.create).toHaveBeenCalledWith({
                data: { ...new SalePrismaMapper().mapFromEntity(sale), user_id },
            });
        });
    });

    describe('update', () => {
        it('writes only the given columns, filtered by id AND user_id', async () => {
            prisma.sale.update.mockResolvedValueOnce(rowOf({ quantity: 5 }));

            await expect(repository.update(scope, sale_id, { quantity: 5 })).resolves.toEqual(
                defaultSale({ quantity: 5 }),
            );
            expect(prisma.sale.update).toHaveBeenCalledWith({
                where: { id: sale_id, user_id },
                data: { quantity: 5 },
            });
        });

        it('returns null when no row matches (P2025)', async () => {
            prisma.sale.update.mockRejectedValueOnce(recordNotFound());

            await expect(repository.update(scope, sale_id, { quantity: 5 })).resolves.toBeNull();
        });

        it('propagates other failures', async () => {
            const failure = new Error('connection lost');
            prisma.sale.update.mockRejectedValueOnce(failure);

            await expect(repository.update(scope, sale_id, { quantity: 5 })).rejects.toBe(failure);
        });
    });

    describe('delete', () => {
        it('deletes by id AND user_id', async () => {
            prisma.sale.deleteMany.mockResolvedValueOnce({ count: 1 });

            await expect(repository.delete(scope, sale_id)).resolves.toBe(true);
            expect(prisma.sale.deleteMany).toHaveBeenCalledWith({ where: { id: sale_id, user_id } });
        });

        it('returns false when nothing matched', async () => {
            prisma.sale.deleteMany.mockResolvedValueOnce({ count: 0 });

            await expect(repository.delete(scope, sale_id)).resolves.toBe(false);
        });
    });

    describe('transaction', () => {
        it('runs lock, insert and update on the $transaction client, not the root client', async () => {
            tx.$queryRaw.mockResolvedValueOnce([{ id: product_id, name: 'Brigadeiro', price_cents: 300 }]);
            tx.sale.create.mockResolvedValueOnce(rowOf());
            tx.sale.update.mockResolvedValueOnce(rowOf());

            await repository.transaction(async (transactional) => {
                await transactional.lockProductForSnapshot(scope, product_id);
                await transactional.insert(scope, defaultSale());
                await transactional.update(scope, sale_id, { quantity: 3 });
            });

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
            expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
            expect(tx.sale.create).toHaveBeenCalledTimes(1);
            expect(tx.sale.update).toHaveBeenCalledWith({ where: { id: sale_id, user_id }, data: { quantity: 3 } });
            expect(prisma.$queryRaw).not.toHaveBeenCalled();
            expect(prisma.sale.create).not.toHaveBeenCalled();
            expect(prisma.sale.update).not.toHaveBeenCalled();
        });

        it('joins the open transaction instead of nesting one', async () => {
            await repository.transaction((outer) => outer.transaction(async () => undefined));

            expect(prisma.$transaction).toHaveBeenCalledTimes(1);
        });

        it('propagates the callback result and errors (Prisma rolls back on rejection)', async () => {
            await expect(repository.transaction(async () => 'done')).resolves.toBe('done');

            const failure = new Error('abort');
            await expect(
                repository.transaction(async () => {
                    throw failure;
                }),
            ).rejects.toBe(failure);
        });
    });
});
