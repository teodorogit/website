import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ERROR_CODE } from '@/common/errors/error-code';
import { encodeCursor } from '@/common/pagination/cursor-page';
import { AuthUser } from '@/modules/auth/auth-user';
import { defaultAuthUser } from '@/modules/auth/test/utils/test.utils';
import { SALE_REPOSITORY, SaleRepository } from '../repository/sale.repository';
import { SalesService } from '../sales.service';
import {
    defaultProductSnapshot,
    defaultSale,
    mockedSaleRepository,
    mockedTransactionalSaleRepository,
    other_product_id,
    product_id,
    sale_id,
    user_id,
} from './utils/test.utils';

describe('SalesService', () => {
    let service: SalesService;
    const user: AuthUser = defaultAuthUser();
    const scope = { user_id };

    beforeEach(async () => {
        jest.resetAllMocks();
        mockedSaleRepository.transaction.mockImplementation((work: (repository: SaleRepository) => Promise<unknown>) =>
            work(mockedTransactionalSaleRepository),
        );

        const moduleRef = await Test.createTestingModule({
            providers: [{ provide: SALE_REPOSITORY, useValue: mockedSaleRepository }, SalesService],
        }).compile();

        service = moduleRef.get(SalesService);
    });

    describe('list', () => {
        beforeEach(() => {
            mockedSaleRepository.findMany.mockResolvedValue([]);
        });

        it('without filters lists every sale of the user with the default page size', async () => {
            await expect(service.list(user, {})).resolves.toEqual({ items: [], nextCursor: null });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, { take: 51 });
        });

        it('a filtered listing returns every matching sale (no default page size)', async () => {
            await expect(service.list(user, { date: '2026-10-24' })).resolves.toEqual({ items: [], nextCursor: null });

            expect(mockedSaleRepository.findMany.mock.calls[0]?.[1]).not.toHaveProperty('take');
        });

        it('a filtered listing paginates when the client asks for it with limit', async () => {
            await service.list(user, { date: '2026-10-24', limit: 10 });

            expect(mockedSaleRepository.findMany.mock.calls[0]?.[1]).toMatchObject({ take: 11 });
        });

        it('date covers exactly one local day in the user timezone (half-open)', async () => {
            await service.list(user, { date: '2026-10-24' });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, {
                occurred_from: new Date('2026-10-24T03:00:00.000Z'),
                occurred_before: new Date('2026-10-25T03:00:00.000Z'),
            });
        });

        it('follows the user timezone, not the server one', async () => {
            await service.list({ ...user, timezone: 'America/Manaus' }, { date: '2026-10-24' });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, {
                occurred_from: new Date('2026-10-24T04:00:00.000Z'),
                occurred_before: new Date('2026-10-25T04:00:00.000Z'),
            });
        });

        it('startDate/endDate are inclusive local days', async () => {
            await service.list(user, { startDate: '2026-10-01', endDate: '2026-10-31' });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, {
                occurred_from: new Date('2026-10-01T03:00:00.000Z'),
                occurred_before: new Date('2026-11-01T03:00:00.000Z'),
            });
        });

        it('accepts startDate alone', async () => {
            await service.list(user, { startDate: '2026-10-01' });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, {
                occurred_from: new Date('2026-10-01T03:00:00.000Z'),
            });
        });

        it('accepts endDate alone', async () => {
            await service.list(user, { endDate: '2026-10-31' });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, {
                occurred_before: new Date('2026-11-01T03:00:00.000Z'),
            });
        });

        it('accepts startDate equal to endDate', async () => {
            await service.list(user, { startDate: '2026-10-24', endDate: '2026-10-24' });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, {
                occurred_from: new Date('2026-10-24T03:00:00.000Z'),
                occurred_before: new Date('2026-10-25T03:00:00.000Z'),
            });
        });

        it.each([{ startDate: '2026-10-01' }, { endDate: '2026-10-31' }])(
            'rejects date combined with %o as SALE_FILTER_CONFLICT',
            async (range) => {
                await expect(service.list(user, { date: '2026-10-24', ...range })).rejects.toEqual(
                    new BadRequestException(ERROR_CODE.SALE_FILTER_CONFLICT),
                );
                expect(mockedSaleRepository.findMany).not.toHaveBeenCalled();
            },
        );

        it('rejects startDate after endDate as INVALID_DATE_RANGE', async () => {
            await expect(service.list(user, { startDate: '2026-10-25', endDate: '2026-10-24' })).rejects.toEqual(
                new BadRequestException(ERROR_CODE.INVALID_DATE_RANGE),
            );
            expect(mockedSaleRepository.findMany).not.toHaveBeenCalled();
        });

        it('fetches limit + 1 rows and returns a cursor to the last item when more exist', async () => {
            const first = defaultSale({ id: '00000000-0000-4000-8000-000000000003' });
            const second = defaultSale({ id: '00000000-0000-4000-8000-000000000002' });
            const extra = defaultSale({ id: '00000000-0000-4000-8000-000000000001' });
            mockedSaleRepository.findMany.mockResolvedValueOnce([first, second, extra]);

            const page = await service.list(user, { limit: 2 });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, { take: 3 });
            expect(page.items).toEqual([first, second]);
            expect(page.nextCursor).toBe(encodeCursor({ occurredAt: second.occurred_at.toISOString(), id: second.id }));
        });

        it('returns a null cursor on the last page', async () => {
            const sale = defaultSale();
            mockedSaleRepository.findMany.mockResolvedValueOnce([sale]);

            await expect(service.list(user, { limit: 1 })).resolves.toEqual({ items: [sale], nextCursor: null });
        });

        it('turns a cursor into the keyset position, combined with the filters', async () => {
            const cursor = encodeCursor({ occurredAt: '2026-10-24T15:30:00.000Z', id: sale_id });

            await service.list(user, { date: '2026-10-24', cursor });

            expect(mockedSaleRepository.findMany).toHaveBeenCalledWith(scope, {
                occurred_from: new Date('2026-10-24T03:00:00.000Z'),
                occurred_before: new Date('2026-10-25T03:00:00.000Z'),
                after: { occurred_at: new Date('2026-10-24T15:30:00.000Z'), id: sale_id },
                take: 51,
            });
        });

        it.each([
            ['not base64 JSON', '%%%'],
            ['wrong keys', encodeCursor({ id: sale_id })],
            ['invalid date', encodeCursor({ occurredAt: 'yesterday', id: sale_id })],
            ['non-canonical date', encodeCursor({ occurredAt: '2026-10-24', id: sale_id })],
            ['invalid id', encodeCursor({ occurredAt: '2026-10-24T15:30:00.000Z', id: "1' OR '1'='1" })],
        ])('rejects a cursor with %s as INVALID_CURSOR', async (_, cursor) => {
            await expect(service.list(user, { cursor })).rejects.toEqual(
                new BadRequestException(ERROR_CODE.INVALID_CURSOR),
            );
            expect(mockedSaleRepository.findMany).not.toHaveBeenCalled();
        });
    });

    describe('create', () => {
        afterEach(() => {
            jest.useRealTimers();
        });

        it('snapshots the locked product inside one transaction, at the current local time on the given day', async () => {
            // 2026-11-04 23:30 in São Paulo, already 2026-11-05 11:30 on the Tokyo test runner.
            jest.useFakeTimers({ now: new Date('2026-11-05T02:30:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
            mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(
                defaultProductSnapshot({ name: 'Brownie', price_cents: 850, preparation_cost_cents: 250 }),
            );
            mockedTransactionalSaleRepository.insert.mockImplementationOnce(async (_scope, sale) => sale);

            const created = await service.create(user, { productId: product_id, quantity: 3, date: '2026-11-05' });

            expect(mockedSaleRepository.transaction).toHaveBeenCalledTimes(1);
            expect(mockedTransactionalSaleRepository.lockProductForSnapshot).toHaveBeenCalledWith(scope, product_id);
            expect(mockedTransactionalSaleRepository.insert).toHaveBeenCalledWith(scope, created);
            expect(mockedSaleRepository.insert).not.toHaveBeenCalled();
            expect(created).toMatchObject({
                user_id,
                product_id,
                product_name_snapshot: 'Brownie',
                unit_price_cents: 850,
                unit_cost_cents: 250,
                quantity: 3,
                occurred_at: new Date('2026-11-06T02:30:00.000Z'),
            });
        });

        it.each([250, 0])(
            'snapshots the preparation cost the locked product has at that moment (%p cents)',
            async (preparation_cost_cents) => {
                mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(
                    defaultProductSnapshot({ preparation_cost_cents }),
                );
                mockedTransactionalSaleRepository.insert.mockImplementationOnce(async (_scope, sale) => sale);

                const created = await service.create(user, { productId: product_id, quantity: 2, date: '2026-10-24' });

                // toBe, so a cost that never left the catalog row (undefined) cannot pass as the column default 0.
                expect(created.unit_cost_cents).toBe(preparation_cost_cents);
                expect(created.unit_price_cents).toBe(300);
            },
        );

        it('returns the persisted sale', async () => {
            const persisted = defaultSale();
            mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(defaultProductSnapshot());
            mockedTransactionalSaleRepository.insert.mockResolvedValueOnce(persisted);

            await expect(
                service.create(user, { productId: product_id, quantity: 2, date: '2026-10-24' }),
            ).resolves.toBe(persisted);
        });

        it('404 PRODUCT_NOT_FOUND when the product is missing or belongs to another user', async () => {
            mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(null);

            await expect(
                service.create(user, { productId: other_product_id, quantity: 1, date: '2026-10-24' }),
            ).rejects.toEqual(new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND));
            expect(mockedTransactionalSaleRepository.insert).not.toHaveBeenCalled();
        });
    });

    describe('update', () => {
        beforeEach(() => {
            mockedTransactionalSaleRepository.update.mockImplementation(async () => defaultSale());
        });

        it('404 SALE_NOT_FOUND when the sale is missing or belongs to another user', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(null);

            await expect(service.update(user, sale_id, { quantity: 3 })).rejects.toEqual(
                new NotFoundException(ERROR_CODE.SALE_NOT_FOUND),
            );
            expect(mockedTransactionalSaleRepository.findById).toHaveBeenCalledWith(scope, sale_id);
            expect(mockedTransactionalSaleRepository.update).not.toHaveBeenCalled();
        });

        it('changes only the quantity, keeping the snapshot', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale());

            await service.update(user, sale_id, { quantity: 5 });

            expect(mockedTransactionalSaleRepository.lockProductForSnapshot).not.toHaveBeenCalled();
            expect(mockedTransactionalSaleRepository.update).toHaveBeenCalledWith(scope, sale_id, { quantity: 5 });
            expect(mockedSaleRepository.update).not.toHaveBeenCalled();
        });

        it('re-sending the current productId does not reprice the sale', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale());

            await service.update(user, sale_id, { productId: product_id, quantity: 4 });

            expect(mockedTransactionalSaleRepository.lockProductForSnapshot).not.toHaveBeenCalled();
            expect(mockedTransactionalSaleRepository.update).toHaveBeenCalledWith(scope, sale_id, { quantity: 4 });
        });

        it('re-sending the current productId in uppercase does not reprice the sale', async () => {
            const hex_product_id = 'abcdef12-3456-4789-8abc-def123456789';
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(
                defaultSale({ product_id: hex_product_id }),
            );

            await service.update(user, sale_id, { productId: hex_product_id.toUpperCase(), quantity: 4 });

            expect(mockedTransactionalSaleRepository.lockProductForSnapshot).not.toHaveBeenCalled();
            expect(mockedTransactionalSaleRepository.update).toHaveBeenCalledWith(scope, sale_id, { quantity: 4 });
        });

        it('swapping the product updates link, name, unit price and unit cost together from the catalog', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale());
            mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(
                defaultProductSnapshot({
                    id: other_product_id,
                    name: 'Brownie',
                    price_cents: 850,
                    preparation_cost_cents: 250,
                }),
            );

            await service.update(user, sale_id, { productId: other_product_id });

            expect(mockedTransactionalSaleRepository.lockProductForSnapshot).toHaveBeenCalledWith(
                scope,
                other_product_id,
            );
            expect(mockedTransactionalSaleRepository.update).toHaveBeenCalledWith(scope, sale_id, {
                product_id: other_product_id,
                product_name_snapshot: 'Brownie',
                unit_price_cents: 850,
                unit_cost_cents: 250,
            });
        });

        it('a swap to a product without a cost stores 0, not the cost of the product it replaces', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale({ unit_cost_cents: 100 }));
            mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(
                defaultProductSnapshot({
                    id: other_product_id,
                    name: 'Brownie',
                    price_cents: 850,
                    preparation_cost_cents: 0,
                }),
            );

            await service.update(user, sale_id, { productId: other_product_id, quantity: 4 });

            // toStrictEqual: an undefined unit_cost_cents would leave the old cost in the row.
            expect(mockedTransactionalSaleRepository.update.mock.calls[0]?.[2]).toStrictEqual({
                product_id: other_product_id,
                product_name_snapshot: 'Brownie',
                unit_price_cents: 850,
                unit_cost_cents: 0,
                quantity: 4,
            });
        });

        it('relinks a sale whose product was deleted when a productId is sent', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale({ product_id: null }));
            mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(defaultProductSnapshot());

            await service.update(user, sale_id, { productId: product_id });

            expect(mockedTransactionalSaleRepository.update).toHaveBeenCalledWith(scope, sale_id, {
                product_id,
                product_name_snapshot: 'Brigadeiro',
                unit_price_cents: 300,
                unit_cost_cents: 100,
            });
        });

        // Editing a product's preparation cost never re-costs sales already recorded: without a swap the
        // catalog is not even read, and no snapshot column reaches the write.
        it.each([
            ['re-sending the current productId', { productId: product_id }, {}],
            [
                're-sending the current productId with a quantity',
                { productId: product_id, quantity: 4 },
                { quantity: 4 },
            ],
            ['a quantity-only edit', { quantity: 5 }, { quantity: 5 }],
            ['a date-only edit', { date: '2026-10-20' }, { occurred_at: new Date('2026-10-20T15:30:00.000Z') }],
        ])('%s keeps the stored unit cost: no unit_cost_cents in the changes', async (_, dto, expectedChanges) => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale());

            await service.update(user, sale_id, dto);

            expect(mockedTransactionalSaleRepository.lockProductForSnapshot).not.toHaveBeenCalled();
            // toStrictEqual: exactly these keys, not even a snapshot column set to undefined.
            expect(mockedTransactionalSaleRepository.update.mock.calls[0]?.[2]).toStrictEqual(expectedChanges);
        });

        it('keeps the snapshot of a sale whose product was deleted when productId is absent', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale({ product_id: null }));

            await service.update(user, sale_id, { quantity: 1 });

            expect(mockedTransactionalSaleRepository.lockProductForSnapshot).not.toHaveBeenCalled();
            expect(mockedTransactionalSaleRepository.update).toHaveBeenCalledWith(scope, sale_id, { quantity: 1 });
        });

        it('404 PRODUCT_NOT_FOUND when the new product is missing or foreign, without writing', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale());
            mockedTransactionalSaleRepository.lockProductForSnapshot.mockResolvedValueOnce(null);

            await expect(service.update(user, sale_id, { productId: other_product_id })).rejects.toEqual(
                new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND),
            );
            expect(mockedTransactionalSaleRepository.update).not.toHaveBeenCalled();
        });

        it('moving to another date keeps the local time of day (user timezone)', async () => {
            // 12:30:45.123 in São Paulo; 00:30 the next day on the Tokyo test runner.
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(
                defaultSale({ occurred_at: new Date('2026-10-24T15:30:45.123Z') }),
            );

            await service.update(user, sale_id, { date: '2026-10-20' });

            expect(mockedTransactionalSaleRepository.update).toHaveBeenCalledWith(scope, sale_id, {
                occurred_at: new Date('2026-10-20T15:30:45.123Z'),
            });
        });

        it('404 SALE_NOT_FOUND when the sale disappears before the write', async () => {
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale());
            mockedTransactionalSaleRepository.update.mockResolvedValueOnce(null);

            await expect(service.update(user, sale_id, { quantity: 2 })).rejects.toEqual(
                new NotFoundException(ERROR_CODE.SALE_NOT_FOUND),
            );
        });

        it('returns the updated sale', async () => {
            const updated = defaultSale({ quantity: 9 });
            mockedTransactionalSaleRepository.findById.mockResolvedValueOnce(defaultSale());
            mockedTransactionalSaleRepository.update.mockResolvedValueOnce(updated);

            await expect(service.update(user, sale_id, { quantity: 9 })).resolves.toBe(updated);
            expect(mockedSaleRepository.transaction).toHaveBeenCalledTimes(1);
        });
    });

    describe('remove', () => {
        it('deletes the user sale', async () => {
            mockedSaleRepository.delete.mockResolvedValueOnce(true);

            await expect(service.remove(user, sale_id)).resolves.toBeUndefined();
            expect(mockedSaleRepository.delete).toHaveBeenCalledWith(scope, sale_id);
        });

        it('404 SALE_NOT_FOUND when nothing was deleted (missing or foreign)', async () => {
            mockedSaleRepository.delete.mockResolvedValueOnce(false);

            await expect(service.remove(user, sale_id)).rejects.toEqual(
                new NotFoundException(ERROR_CODE.SALE_NOT_FOUND),
            );
        });
    });
});
