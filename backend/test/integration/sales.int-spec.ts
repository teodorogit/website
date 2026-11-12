import { randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { IntegrationApp, authAs, createIntegrationApp, resetDatabase } from './int-app.util';

/**
 * /api/sales against the real PostgreSQL: snapshots taken inside a transaction with
 * `SELECT … FOR SHARE`, local-day filtering in the user's timezone (America/Sao_Paulo, UTC-3,
 * no DST since 2019) while the process runs in Asia/Tokyo, keyset pagination and edits.
 */

const ALICE = 'user_alice';
const BOB = 'user_bob';

/** Fakes only `Date` (and friends): Prisma, supertest and the HTTP server keep real timers. */
function pinNow(iso: string): void {
    jest.useFakeTimers({
        now: new Date(iso),
        doNotFake: [
            'nextTick',
            'setImmediate',
            'clearImmediate',
            'setTimeout',
            'setInterval',
            'clearTimeout',
            'clearInterval',
            'queueMicrotask',
            'hrtime',
            'performance',
        ],
    });
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

const INVALID_CURSOR = errorBody('INVALID_CURSOR', 'Cursor de paginação inválido.');
const INVALID_DATE_RANGE = errorBody('INVALID_DATE_RANGE', 'A data inicial deve ser anterior ou igual à data final.');
const SALE_FILTER_CONFLICT = errorBody(
    'SALE_FILTER_CONFLICT',
    'Use o filtro "date" ou o intervalo "startDate"/"endDate", não ambos.',
);
const SALE_NOT_FOUND = errorBody('SALE_NOT_FOUND', 'Venda não encontrada.');
const PRODUCT_NOT_FOUND = errorBody('PRODUCT_NOT_FOUND', 'Produto não encontrado.');

type ProductBody = { id: string; name: string; price: number };
type SaleBody = {
    id: string;
    productId: string | null;
    productName: string;
    unitPrice: number;
    unitCost: number;
    quantity: number;
    total: number;
    profit: number;
    date: string;
    time: string;
};
type SaleListBody = { items: SaleBody[]; nextCursor: string | null };

describe('Sales (integration, real PostgreSQL)', () => {
    let ctx: IntegrationApp;

    beforeAll(async () => {
        ctx = await createIntegrationApp();
    });

    afterAll(async () => {
        await ctx.app.close();
    });

    beforeEach(async () => {
        await resetDatabase(ctx.prisma);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    const server = () => ctx.app.getHttpServer();

    async function createProduct(user: string, name: string, price: number, preparationCost = 0): Promise<ProductBody> {
        const response = await request(server())
            .post('/api/products')
            .set(authAs(user))
            .send({ name, price, preparationCost })
            .expect(HttpStatus.CREATED);

        return response.body as ProductBody;
    }

    async function userIdOf(clerkUserId: string): Promise<string> {
        await request(server()).get('/api/products').set(authAs(clerkUserId)).expect(HttpStatus.OK);
        const user = await ctx.prisma.user.findUniqueOrThrow({ where: { clerk_user_id: clerkUserId } });
        return user.id;
    }

    type SeedSale = {
        id?: string;
        occurred_at: string;
        product_id?: string | null;
        name?: string;
        unit_price_cents?: number;
        quantity?: number;
    };

    async function seedSale(userId: string, sale: SeedSale): Promise<string> {
        const row = await ctx.prisma.sale.create({
            data: {
                ...(sale.id && { id: sale.id }),
                user_id: userId,
                product_id: sale.product_id ?? null,
                product_name_snapshot: sale.name ?? 'Brigadeiro',
                unit_price_cents: sale.unit_price_cents ?? 300,
                quantity: sale.quantity ?? 1,
                occurred_at: new Date(sale.occurred_at),
            },
        });

        return row.id;
    }

    async function list(user: string, query: Record<string, string | number> = {}) {
        return request(server()).get('/api/sales').query(query).set(authAs(user));
    }

    async function listOk(user: string, query: Record<string, string | number> = {}): Promise<SaleListBody> {
        const response = await list(user, query);
        expect(response.status).toBe(HttpStatus.OK);
        return response.body as SaleListBody;
    }

    describe('POST /api/sales', () => {
        it('snapshots name and unit price from the DB product at the current São Paulo time of the given day', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3.5);
            const aliceId = await userIdOf(ALICE);
            // 12:30:45.123 in São Paulo, 00:30 next day in Tokyo (the process TZ).
            pinNow('2026-10-24T15:30:45.123Z');

            const response = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 3, date: '2026-10-20' })
                .expect(HttpStatus.CREATED);

            expect(response.body).toEqual({
                id: expect.any(String),
                productId: product.id,
                productName: 'Brigadeiro',
                unitPrice: 3.5,
                unitCost: 0,
                quantity: 3,
                total: 10.5,
                profit: 10.5,
                date: '2026-10-20',
                time: '12:30',
            });

            const rows = await ctx.prisma.sale.findMany();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({
                id: (response.body as SaleBody).id,
                user_id: aliceId,
                product_id: product.id,
                product_name_snapshot: 'Brigadeiro',
                unit_price_cents: 350,
                quantity: 3,
            });
            expect(rows[0]!.occurred_at.toISOString()).toBe('2026-10-20T15:30:45.123Z');
        });

        it('stamps late-evening sales on the São Paulo day even when UTC and the server are already on the next day', async () => {
            const product = await createProduct(ALICE, 'Beijinho', 2);
            // 23:30 on Oct 24 in São Paulo = Oct 25 02:30 UTC = Oct 25 11:30 Tokyo.
            pinNow('2026-10-25T02:30:00.000Z');

            const response = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 1, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);

            expect(response.body).toMatchObject({ date: '2026-10-24', time: '23:30' });
            const row = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: (response.body as SaleBody).id } });
            expect(row.occurred_at.toISOString()).toBe('2026-10-25T02:30:00.000Z');

            const day = await listOk(ALICE, { date: '2026-10-24' });
            expect(day.items.map((s) => s.id)).toEqual([(response.body as SaleBody).id]);
        });

        it('later product edits do not rewrite the snapshot', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3);
            const created = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 2, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);

            await request(server())
                .patch(`/api/products/${product.id}`)
                .set(authAs(ALICE))
                .send({ name: 'Brigadeiro Gourmet', price: 5 })
                .expect(HttpStatus.OK);

            const page = await listOk(ALICE);
            expect(page.items).toEqual([
                expect.objectContaining({
                    id: (created.body as SaleBody).id,
                    productId: product.id,
                    productName: 'Brigadeiro',
                    unitPrice: 3,
                    total: 6,
                }),
            ]);
        });

        it('snapshots the product name as stored (citext round-trips through the raw FOR SHARE query)', async () => {
            const product = await createProduct(ALICE, 'Pão de Mel Ção', 4.25);

            const response = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id.toUpperCase(), quantity: 1, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);

            expect(response.body).toMatchObject({
                productId: product.id,
                productName: 'Pão de Mel Ção',
                unitPrice: 4.25,
            });
        });

        it('404 PRODUCT_NOT_FOUND for another user’s product or a missing one, and writes nothing', async () => {
            const bobsProduct = await createProduct(BOB, 'Brownie', 8);

            for (const productId of [bobsProduct.id, randomUUID()]) {
                const response = await request(server())
                    .post('/api/sales')
                    .set(authAs(ALICE))
                    .send({ productId, quantity: 1, date: '2026-10-24' })
                    .expect(HttpStatus.NOT_FOUND);

                expect(response.body).toEqual(PRODUCT_NOT_FOUND);
            }

            expect(await ctx.prisma.sale.count()).toBe(0);
        });

        it('400 when the client tries to send name/price or an invalid quantity/date', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3);

            const forged = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 1, date: '2026-10-24', productName: 'X', unitPrice: 0.01 })
                .expect(HttpStatus.BAD_REQUEST);
            expect(forged.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: expect.arrayContaining([
                        { field: 'productName', message: 'Campo não permitido.' },
                        { field: 'unitPrice', message: 'Campo não permitido.' },
                    ]),
                },
            });

            const invalid = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 0, date: '2026-02-30' })
                .expect(HttpStatus.BAD_REQUEST);
            expect(invalid.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [
                        { field: 'quantity', message: 'Deve ser maior que zero.' },
                        { field: 'date', message: 'Deve ser uma data válida no formato AAAA-MM-DD.' },
                    ],
                },
            });

            expect(await ctx.prisma.sale.count()).toBe(0);
        });

        it('concurrent creates on the same product all succeed (FOR SHARE locks are compatible)', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3);

            const responses = await Promise.all(
                Array.from({ length: 8 }, (_, i) =>
                    request(server())
                        .post('/api/sales')
                        .set(authAs(ALICE))
                        .send({ productId: product.id, quantity: i + 1, date: '2026-10-24' }),
                ),
            );

            expect(responses.map((r) => r.status)).toEqual(Array(8).fill(HttpStatus.CREATED));
            expect(await ctx.prisma.sale.count({ where: { product_id: product.id } })).toBe(8);
        });

        /** Resolves once some backend is blocked on a row lock (i.e. the sale's FOR SHARE is waiting). */
        async function waitForLockWaiter(): Promise<void> {
            for (let i = 0; i < 100; i++) {
                const [row] = await ctx.prisma.$queryRaw<{ n: number }[]>`
                    SELECT count(*)::int AS n FROM pg_stat_activity
                    WHERE datname = current_database() AND wait_event_type = 'Lock'`;
                if (row && row.n > 0) {
                    return;
                }
                await new Promise((resolve) => setTimeout(resolve, 50));
            }

            throw new Error('The sale never blocked on the product row lock (FOR SHARE did not run?)');
        }

        it('waits on an uncommitted price change and snapshots the committed price (FOR SHARE)', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3);
            let sale: Promise<request.Response> | undefined;

            await ctx.prisma.$transaction(
                async (tx) => {
                    await tx.$executeRaw`UPDATE products SET price_cents = 450 WHERE id = ${product.id}::uuid`;
                    sale = request(server())
                        .post('/api/sales')
                        .set(authAs(ALICE))
                        .send({ productId: product.id, quantity: 2, date: '2026-10-24' })
                        .then((response) => response);
                    await waitForLockWaiter();
                },
                { timeout: 15_000 },
            );

            const response = await sale!;
            expect(response.status).toBe(HttpStatus.CREATED);
            expect(response.body).toMatchObject({ unitPrice: 4.5, total: 9 });
            expect(await ctx.prisma.sale.findFirstOrThrow()).toMatchObject({ unit_price_cents: 450 });
        });

        it('waits on an uncommitted product delete and answers 404, not an FK-violation 500', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3);
            let sale: Promise<request.Response> | undefined;

            await ctx.prisma.$transaction(
                async (tx) => {
                    await tx.$executeRaw`DELETE FROM products WHERE id = ${product.id}::uuid`;
                    sale = request(server())
                        .post('/api/sales')
                        .set(authAs(ALICE))
                        .send({ productId: product.id, quantity: 2, date: '2026-10-24' })
                        .then((response) => response);
                    await waitForLockWaiter();
                },
                { timeout: 15_000 },
            );

            const response = await sale!;
            expect(response.status).toBe(HttpStatus.NOT_FOUND);
            expect(response.body).toEqual(PRODUCT_NOT_FOUND);
            expect(await ctx.prisma.sale.count()).toBe(0);
        });

        it('a product delete racing a sale create never yields a 500 or a dangling product_id', async () => {
            for (let attempt = 0; attempt < 5; attempt++) {
                const product = await createProduct(ALICE, `Produto ${attempt}`, 3);

                const [sale, deletion] = await Promise.all([
                    request(server())
                        .post('/api/sales')
                        .set(authAs(ALICE))
                        .send({ productId: product.id, quantity: 1, date: '2026-10-24' }),
                    request(server()).delete(`/api/products/${product.id}`).set(authAs(ALICE)),
                ]);

                expect(deletion.status).toBe(HttpStatus.NO_CONTENT);
                expect(await ctx.prisma.product.count({ where: { id: product.id } })).toBe(0);

                if (sale.status === HttpStatus.CREATED) {
                    // Sale committed first; the delete then nulled its link but kept the snapshot.
                    const row = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: (sale.body as SaleBody).id } });
                    expect(row).toMatchObject({
                        product_id: null,
                        product_name_snapshot: `Produto ${attempt}`,
                        unit_price_cents: 300,
                    });
                } else {
                    expect(sale.status).toBe(HttpStatus.NOT_FOUND);
                    expect(sale.body).toEqual(PRODUCT_NOT_FOUND);
                }
            }

            expect(await ctx.prisma.sale.count({ where: { product_id: { not: null } } })).toBe(0);
        });
    });

    describe('quantity × unit price arithmetic (cents)', () => {
        it.each([
            [0.1, 3, 10, 0.3],
            [0.29, 3, 29, 0.87],
            [19.99, 7, 1999, 139.93],
            [1.15, 100, 115, 115],
            [1_000_000, 100_000, 100_000_000, 100_000_000_000],
        ])('price %p × %p → unit_price_cents %p, total %p', async (price, quantity, cents, total) => {
            const product = await createProduct(ALICE, 'Produto', price);

            const response = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);

            expect(response.body).toMatchObject({ unitPrice: price, quantity, total });
            const row = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: (response.body as SaleBody).id } });
            expect(row.unit_price_cents).toBe(cents);

            const page = await listOk(ALICE);
            expect(page.items[0]).toMatchObject({ unitPrice: price, quantity, total });
        });
    });

    /**
     * The preparation cost is snapshotted like the name and the price: read from the locked catalog row
     * when the sale is created or its product is swapped, and never again. The costs asserted here are
     * not zero: a cost that never left the catalog row would be stored as the column default, 0, and a
     * product without a cost could not tell the two apart.
     */
    describe('unit cost snapshot and profit', () => {
        async function sell(productId: string, quantity: number, date = '2026-10-24'): Promise<SaleBody> {
            const response = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId, quantity, date })
                .expect(HttpStatus.CREATED);

            return response.body as SaleBody;
        }

        async function patchProduct(id: string, body: Record<string, unknown>): Promise<void> {
            await request(server()).patch(`/api/products/${id}`).set(authAs(ALICE)).send(body).expect(HttpStatus.OK);
        }

        async function patchSale(id: string, body: Record<string, unknown>): Promise<SaleBody> {
            const response = await request(server())
                .patch(`/api/sales/${id}`)
                .set(authAs(ALICE))
                .send(body)
                .expect(HttpStatus.OK);

            return response.body as SaleBody;
        }

        const rowOf = (id: string) => ctx.prisma.sale.findUniqueOrThrow({ where: { id } });

        it('POST stores the product’s preparation cost on the sale and returns unitCost and profit', async () => {
            // In floats: 19.99 × 7 = 139.92999999999998 and (19.99 − 7.35) × 7 = 88.47999999999999.
            const product = await createProduct(ALICE, 'Brownie', 19.99, 7.35);
            pinNow('2026-10-24T15:30:00.000Z');

            const response = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 7, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);

            expect(response.body).toEqual({
                id: expect.any(String),
                productId: product.id,
                productName: 'Brownie',
                unitPrice: 19.99,
                unitCost: 7.35,
                quantity: 7,
                total: 139.93,
                profit: 88.48,
                date: '2026-10-24',
                time: '12:30',
            });

            const sale = response.body as SaleBody;
            expect(await rowOf(sale.id)).toMatchObject({
                product_id: product.id,
                unit_price_cents: 1999,
                unit_cost_cents: 735,
                quantity: 7,
            });
            // The listing reads the same stored snapshot back.
            expect((await listOk(ALICE)).items).toEqual([sale]);
        });

        it('a product sold below its preparation cost yields a negative profit', async () => {
            const product = await createProduct(ALICE, 'Trufa', 3, 4.5);

            const sale = await sell(product.id, 3);

            expect(sale).toMatchObject({ unitPrice: 3, unitCost: 4.5, total: 9, profit: -4.5 });
            expect(await rowOf(sale.id)).toMatchObject({ unit_price_cents: 300, unit_cost_cents: 450 });
        });

        it('PATCH /api/products/:id changing preparationCost leaves the sale’s unitCost and profit untouched', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3, 1);
            const sale = await sell(product.id, 2);
            expect(sale).toMatchObject({ unitPrice: 3, unitCost: 1, total: 6, profit: 4 });

            await patchProduct(product.id, { preparationCost: 2.5 });

            expect((await listOk(ALICE)).items).toEqual([sale]);
            expect(await rowOf(sale.id)).toMatchObject({ unit_price_cents: 300, unit_cost_cents: 100, quantity: 2 });

            // A sale recorded after the edit takes the new cost; the old one still does not move.
            const newer = await sell(product.id, 2, '2026-10-25');
            expect(newer).toMatchObject({ unitPrice: 3, unitCost: 2.5, total: 6, profit: 1 });
            expect((await listOk(ALICE)).items).toEqual([newer, sale]);
        });

        it('PATCH /api/sales/:id swapping to another product re-snapshots the cost with the name and price', async () => {
            const brigadeiro = await createProduct(ALICE, 'Brigadeiro', 3, 1);
            const brownie = await createProduct(ALICE, 'Brownie', 8.75, 2.5);
            const beijinho = await createProduct(ALICE, 'Beijinho', 2);
            const sale = await sell(brigadeiro.id, 2);
            expect(sale).toMatchObject({ unitCost: 1, profit: 4 });

            const swapped = await patchSale(sale.id, { productId: brownie.id });
            expect(swapped).toEqual({
                ...sale,
                productId: brownie.id,
                productName: 'Brownie',
                unitPrice: 8.75,
                unitCost: 2.5,
                total: 17.5,
                profit: 12.5,
            });
            expect(await rowOf(sale.id)).toMatchObject({
                product_id: brownie.id,
                product_name_snapshot: 'Brownie',
                unit_price_cents: 875,
                unit_cost_cents: 250,
                quantity: 2,
            });

            // A product without a cost overwrites the previous one with zero instead of leaving it behind.
            const withoutCost = await patchSale(sale.id, { productId: beijinho.id });
            expect(withoutCost).toEqual({
                ...sale,
                productId: beijinho.id,
                productName: 'Beijinho',
                unitPrice: 2,
                unitCost: 0,
                total: 4,
                profit: 4,
            });
            expect(await rowOf(sale.id)).toMatchObject({ unit_price_cents: 200, unit_cost_cents: 0 });
        });

        it('a quantity-only PATCH keeps the cost and recomputes the profit, as do a re-sent productId and a new date', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3, 1);
            const sale = await sell(product.id, 2);
            // The catalog now disagrees with the sale, so a re-snapshot on any of these edits would show.
            await patchProduct(product.id, { preparationCost: 2.5 });

            const moreUnits = await patchSale(sale.id, { quantity: 5 });
            expect(moreUnits).toEqual({ ...sale, quantity: 5, total: 15, profit: 10 });

            const sameProduct = await patchSale(sale.id, { productId: product.id.toUpperCase(), quantity: 4 });
            expect(sameProduct).toEqual({ ...sale, quantity: 4, total: 12, profit: 8 });

            const moved = await patchSale(sale.id, { date: '2026-10-20' });
            expect(moved).toEqual({ ...sale, quantity: 4, total: 12, profit: 8, date: '2026-10-20' });

            expect(await rowOf(sale.id)).toMatchObject({
                product_id: product.id,
                unit_price_cents: 300,
                unit_cost_cents: 100,
                quantity: 4,
            });
        });

        it('DELETE of the product keeps the cost on the sale, which stays editable', async () => {
            const product = await createProduct(ALICE, 'Brownie', 8, 2.5);
            const sale = await sell(product.id, 3);
            expect(sale).toMatchObject({ unitPrice: 8, unitCost: 2.5, total: 24, profit: 16.5 });

            await request(server())
                .delete(`/api/products/${product.id}`)
                .set(authAs(ALICE))
                .expect(HttpStatus.NO_CONTENT);

            const orphan = { ...sale, productId: null };
            expect((await listOk(ALICE)).items).toEqual([orphan]);
            expect(await rowOf(sale.id)).toMatchObject({
                product_id: null,
                product_name_snapshot: 'Brownie',
                unit_price_cents: 800,
                unit_cost_cents: 250,
            });

            const edited = await patchSale(sale.id, { quantity: 1 });
            expect(edited).toEqual({ ...orphan, quantity: 1, total: 8, profit: 5.5 });
            expect(await rowOf(sale.id)).toMatchObject({ product_id: null, unit_cost_cents: 250, quantity: 1 });
        });
    });

    describe('GET /api/sales filters', () => {
        it('?date= is the user’s São Paulo day, not the UTC or server (Tokyo) day', async () => {
            const aliceId = await userIdOf(ALICE);
            const lastSecondOf23 = await seedSale(aliceId, { occurred_at: '2026-10-24T02:59:59.999Z' }); // Oct 23 23:59:59.999
            const firstOf24 = await seedSale(aliceId, { occurred_at: '2026-10-24T03:00:00.000Z' }); // Oct 24 00:00
            const lateOn24 = await seedSale(aliceId, { occurred_at: '2026-10-25T02:30:00.000Z' }); // Oct 24 23:30
            const firstOf25 = await seedSale(aliceId, { occurred_at: '2026-10-25T03:00:00.000Z' }); // Oct 25 00:00

            const oct24 = await listOk(ALICE, { date: '2026-10-24' });
            expect(oct24).toEqual({
                items: [
                    expect.objectContaining({ id: lateOn24, date: '2026-10-24', time: '23:30' }),
                    expect.objectContaining({ id: firstOf24, date: '2026-10-24', time: '00:00' }),
                ],
                nextCursor: null,
            });

            const oct25 = await listOk(ALICE, { date: '2026-10-25' });
            expect(oct25.items).toEqual([
                expect.objectContaining({ id: firstOf25, date: '2026-10-25', time: '00:00' }),
            ]);

            const oct23 = await listOk(ALICE, { date: '2026-10-23' });
            expect(oct23.items).toEqual([
                expect.objectContaining({ id: lastSecondOf23, date: '2026-10-23', time: '23:59' }),
            ]);
        });

        it('honours the timezone stored on the user row', async () => {
            const aliceId = await userIdOf(ALICE);
            await ctx.prisma.user.update({ where: { id: aliceId }, data: { timezone: 'America/Manaus' } }); // UTC-4
            const sale = await seedSale(aliceId, { occurred_at: '2026-10-25T03:30:00.000Z' }); // Manaus Oct 24 23:30

            expect((await listOk(ALICE, { date: '2026-10-24' })).items).toEqual([
                expect.objectContaining({ id: sale, date: '2026-10-24', time: '23:30' }),
            ]);
            expect((await listOk(ALICE, { date: '2026-10-25' })).items).toEqual([]);
        });

        it('?startDate&endDate are inclusive local days; either bound works alone', async () => {
            const aliceId = await userIdOf(ALICE);
            const ids: Record<string, string> = {};
            for (const day of ['20', '21', '22', '23', '24', '25']) {
                ids[day] = await seedSale(aliceId, { occurred_at: `2026-10-${day}T15:00:00.000Z` }); // noon local
            }
            const lateOn23 = await seedSale(aliceId, { occurred_at: '2026-10-24T02:59:59.999Z' }); // Oct 23 23:59:59.999
            const earlyOn21 = await seedSale(aliceId, { occurred_at: '2026-10-21T03:00:00.000Z' }); // Oct 21 00:00

            const range = await listOk(ALICE, { startDate: '2026-10-21', endDate: '2026-10-23' });
            expect(range.items.map((s) => s.id)).toEqual([lateOn23, ids['23'], ids['22'], ids['21'], earlyOn21]);
            expect(range.nextCursor).toBeNull();

            const sameDay = await listOk(ALICE, { startDate: '2026-10-22', endDate: '2026-10-22' });
            expect(sameDay.items.map((s) => s.id)).toEqual([ids['22']]);

            const fromOnly = await listOk(ALICE, { startDate: '2026-10-24' });
            expect(fromOnly.items.map((s) => s.id)).toEqual([ids['25'], ids['24']]);

            const toOnly = await listOk(ALICE, { endDate: '2026-10-20' });
            expect(toOnly.items.map((s) => s.id)).toEqual([ids['20']]);

            const all = await listOk(ALICE);
            expect(all.items).toHaveLength(8);
        });

        it('400 INVALID_DATE_RANGE when startDate > endDate', async () => {
            const response = await list(ALICE, { startDate: '2026-10-24', endDate: '2026-10-23' });
            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual(INVALID_DATE_RANGE);
        });

        it.each([
            [{ date: '2026-10-24', startDate: '2026-10-01' }],
            [{ date: '2026-10-24', endDate: '2026-10-31' }],
            [{ date: '2026-10-24', startDate: '2026-10-01', endDate: '2026-10-31' }],
        ])('400 SALE_FILTER_CONFLICT for %p', async (query) => {
            const response = await list(ALICE, query);
            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual(SALE_FILTER_CONFLICT);
        });

        it.each([
            [{ date: '2026-02-30' }, 'date', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ startDate: '24/10/2026' }, 'startDate', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ limit: 0 }, 'limit', 'Deve ser maior ou igual a 1.'],
            [{ limit: 101 }, 'limit', 'Deve ser menor ou igual a 100.'],
        ])('400 VALIDATION_ERROR for %p', async (query, field, message) => {
            const response = await list(ALICE, query);
            expect(response.status).toBe(HttpStatus.BAD_REQUEST);
            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field, message }],
                },
            });
        });

        it('only ever returns the authenticated user’s sales', async () => {
            const aliceId = await userIdOf(ALICE);
            const bobId = await userIdOf(BOB);
            const alices = await seedSale(aliceId, { occurred_at: '2026-10-24T15:00:00.000Z' });
            await seedSale(bobId, { occurred_at: '2026-10-24T15:00:00.000Z' });

            expect((await listOk(ALICE)).items.map((s) => s.id)).toEqual([alices]);
            expect((await listOk(ALICE, { date: '2026-10-24' })).items.map((s) => s.id)).toEqual([alices]);
        });

        it('a filtered listing returns every matching sale beyond the default page size (Home totals)', async () => {
            const aliceId = await userIdOf(ALICE);
            await ctx.prisma.sale.createMany({
                data: Array.from({ length: 120 }, (_, index) => ({
                    user_id: aliceId,
                    product_name_snapshot: 'Brigadeiro',
                    unit_price_cents: 300,
                    quantity: 1,
                    occurred_at: new Date(Date.UTC(2026, 9, 24, 12, 0, index)), // Oct 24, 09:00 local onwards
                })),
            });

            const day = await listOk(ALICE, { date: '2026-10-24' });
            expect(day.items).toHaveLength(120);
            expect(day.nextCursor).toBeNull();

            const week = await listOk(ALICE, { startDate: '2026-10-19', endDate: '2026-10-25' });
            expect(week.items).toHaveLength(120);
            expect(week.nextCursor).toBeNull();

            const unfiltered = await listOk(ALICE);
            expect(unfiltered.items).toHaveLength(50);
            expect(unfiltered.nextCursor).not.toBeNull();

            const optedIn = await listOk(ALICE, { date: '2026-10-24', limit: 100 });
            expect(optedIn.items).toHaveLength(100);
            expect(optedIn.nextCursor).not.toBeNull();
        });
    });

    describe('GET /api/sales ordering and cursor pagination', () => {
        type Seeded = { id: string; occurred_at: string };

        /** occurred_at DESC, then id DESC (Postgres uuid order = lowercase hex order). */
        function expectedOrder(rows: Seeded[]): string[] {
            return [...rows]
                .sort((a, b) =>
                    a.occurred_at !== b.occurred_at
                        ? b.occurred_at.localeCompare(a.occurred_at)
                        : b.id.localeCompare(a.id),
                )
                .map((r) => r.id);
        }

        async function seedMany(userId: string): Promise<Seeded[]> {
            const tie = '2026-10-24T18:00:00.000Z';
            const instants = [
                '2026-10-24T20:00:00.000Z',
                tie,
                tie,
                tie,
                tie,
                tie,
                '2026-10-24T12:00:00.000Z',
                '2026-10-23T12:00:00.000Z',
                '2026-10-22T12:00:00.000Z',
            ];

            const seeded: Seeded[] = [];
            for (const occurred_at of instants) {
                const id = randomUUID();
                await seedSale(userId, { id, occurred_at });
                seeded.push({ id, occurred_at });
            }

            return seeded;
        }

        async function walk(user: string, query: Record<string, string | number>): Promise<{ pages: string[][] }> {
            const pages: string[][] = [];
            let cursor: string | null = null;

            do {
                const page: SaleListBody = await listOk(user, { ...query, ...(cursor && { cursor }) });
                pages.push(page.items.map((s) => s.id));
                cursor = page.nextCursor;
                expect(pages.length).toBeLessThan(50);
            } while (cursor !== null);

            return { pages };
        }

        it('orders by occurred_at DESC, id DESC including ties', async () => {
            const aliceId = await userIdOf(ALICE);
            const seeded = await seedMany(aliceId);

            const page = await listOk(ALICE);
            expect(page.items.map((s) => s.id)).toEqual(expectedOrder(seeded));
            expect(page.nextCursor).toBeNull();
        });

        it.each([1, 2, 3, 4])(
            'limit=%p walks every page with no duplicates or gaps across same-instant ties',
            async (limit) => {
                const aliceId = await userIdOf(ALICE);
                const seeded = await seedMany(aliceId);
                const expected = expectedOrder(seeded);

                const { pages } = await walk(ALICE, { limit });

                expect(pages.flat()).toEqual(expected);
                expect(new Set(pages.flat()).size).toBe(seeded.length);
                expect(pages.slice(0, -1).every((p) => p.length === limit)).toBe(true);
                expect(pages.length).toBe(Math.ceil(seeded.length / limit));
            },
        );

        it('a page that ends exactly at the last row returns nextCursor null', async () => {
            const aliceId = await userIdOf(ALICE);
            await seedSale(aliceId, { occurred_at: '2026-10-24T15:00:00.000Z' });
            await seedSale(aliceId, { occurred_at: '2026-10-24T16:00:00.000Z' });

            const page = await listOk(ALICE, { limit: 2 });
            expect(page.items).toHaveLength(2);
            expect(page.nextCursor).toBeNull();
        });

        it('pagination composes with the date-range filter', async () => {
            const aliceId = await userIdOf(ALICE);
            const seeded = await seedMany(aliceId);
            await seedSale(aliceId, { occurred_at: '2026-10-25T15:00:00.000Z' }); // outside the range

            const { pages } = await walk(ALICE, { startDate: '2026-10-23', endDate: '2026-10-24', limit: 2 });

            const inRange = seeded.filter((s) => s.occurred_at >= '2026-10-23T03:00:00.000Z');
            expect(pages.flat()).toEqual(expectedOrder(inRange));
        });

        it('defaults to 50 per page', async () => {
            const aliceId = await userIdOf(ALICE);
            await ctx.prisma.sale.createMany({
                data: Array.from({ length: 51 }, (_, i) => ({
                    user_id: aliceId,
                    product_name_snapshot: 'Brigadeiro',
                    unit_price_cents: 300,
                    quantity: 1,
                    occurred_at: new Date(Date.UTC(2026, 9, 1, 12, i)),
                })),
            });

            const first = await listOk(ALICE);
            expect(first.items).toHaveLength(50);
            expect(first.nextCursor).toEqual(expect.any(String));

            const second = await listOk(ALICE, { cursor: first.nextCursor! });
            expect(second.items).toHaveLength(1);
            expect(second.items[0]!.time).toBe('09:00');
            expect(second.nextCursor).toBeNull();
        });

        it('400 INVALID_CURSOR for tampered or garbage cursors', async () => {
            const aliceId = await userIdOf(ALICE);
            await seedMany(aliceId);
            const { nextCursor } = await listOk(ALICE, { limit: 2 });
            expect(nextCursor).toEqual(expect.any(String));

            const decoded = JSON.parse(Buffer.from(nextCursor!, 'base64url').toString('utf8')) as Record<
                string,
                string
            >;
            expect(Object.keys(decoded).sort()).toEqual(['id', 'occurredAt']);
            const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');

            const tampered = [
                encode({ ...decoded, occurredAt: 'yesterday' }),
                encode({ ...decoded, occurredAt: '2026-10-24T18:00:00Z' }), // not the canonical ISO form
                encode({ ...decoded, id: "x' OR '1'='1" }),
                encode({ ...decoded, extra: '1' }),
                encode({ occurredAt: decoded['occurredAt'] }),
                encode({ ...decoded, id: 123 }),
                encode([decoded['occurredAt'], decoded['id']]),
                encode('string'),
                'not-base64-json!!',
                nextCursor!.slice(0, -3),
            ];

            for (const cursor of tampered) {
                const response = await list(ALICE, { cursor });
                expect({ cursor, status: response.status, body: response.body }).toEqual({
                    cursor,
                    status: HttpStatus.BAD_REQUEST,
                    body: INVALID_CURSOR,
                });
            }
        });

        it('a well-formed cursor pointing past everything returns an empty last page', async () => {
            const aliceId = await userIdOf(ALICE);
            await seedMany(aliceId);
            const cursor = Buffer.from(
                JSON.stringify({ occurredAt: '2000-01-01T00:00:00.000Z', id: randomUUID() }),
                'utf8',
            ).toString('base64url');

            expect(await listOk(ALICE, { cursor })).toEqual({ items: [], nextCursor: null });
        });
    });

    describe('PATCH /api/sales/:id', () => {
        async function patch(user: string, id: string, body: Record<string, unknown>) {
            return request(server()).patch(`/api/sales/${id}`).set(authAs(user)).send(body);
        }

        it('switching product re-snapshots name and price from the current catalog', async () => {
            const brigadeiro = await createProduct(ALICE, 'Brigadeiro', 3);
            const brownie = await createProduct(ALICE, 'Brownie', 8);
            const created = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: brigadeiro.id, quantity: 2, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);
            const sale = created.body as SaleBody;

            await request(server())
                .patch(`/api/products/${brownie.id}`)
                .set(authAs(ALICE))
                .send({ price: 8.75 })
                .expect(HttpStatus.OK);

            const response = await patch(ALICE, sale.id, { productId: brownie.id });
            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body).toEqual({
                ...sale,
                productId: brownie.id,
                productName: 'Brownie',
                unitPrice: 8.75,
                total: 17.5,
                profit: 17.5,
            });

            const row = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
            expect(row).toMatchObject({
                product_id: brownie.id,
                product_name_snapshot: 'Brownie',
                unit_price_cents: 875,
                quantity: 2,
            });
        });

        it('re-sending the same productId (any case) keeps the historical snapshot', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3);
            const created = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 2, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);
            const sale = created.body as SaleBody;

            await request(server())
                .patch(`/api/products/${product.id}`)
                .set(authAs(ALICE))
                .send({ name: 'Brigadeiro Novo', price: 4 })
                .expect(HttpStatus.OK);

            for (const productId of [product.id, product.id.toUpperCase()]) {
                const response = await patch(ALICE, sale.id, { productId, quantity: 5 });
                expect(response.status).toBe(HttpStatus.OK);
                expect(response.body).toEqual({ ...sale, quantity: 5, total: 15, profit: 15 });
            }

            const row = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } });
            expect(row).toMatchObject({
                product_id: product.id,
                product_name_snapshot: 'Brigadeiro',
                unit_price_cents: 300,
                quantity: 5,
            });
        });

        it('a sale whose product was deleted keeps its snapshot without a link, and can be relinked', async () => {
            const product = await createProduct(ALICE, 'Brigadeiro', 3);
            const other = await createProduct(ALICE, 'Beijinho', 2.5);
            const created = await request(server())
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 2, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);
            const sale = created.body as SaleBody;

            await request(server())
                .delete(`/api/products/${product.id}`)
                .set(authAs(ALICE))
                .expect(HttpStatus.NO_CONTENT);

            const orphan = { ...sale, productId: null };
            expect((await listOk(ALICE)).items).toEqual([orphan]);

            const edited = await patch(ALICE, sale.id, { quantity: 4, date: '2026-10-23' });
            expect(edited.status).toBe(HttpStatus.OK);
            expect(edited.body).toEqual({ ...orphan, quantity: 4, total: 12, profit: 12, date: '2026-10-23' });
            expect(await ctx.prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).toMatchObject({
                product_id: null,
                product_name_snapshot: 'Brigadeiro',
                unit_price_cents: 300,
            });

            const toDeleted = await patch(ALICE, sale.id, { productId: product.id });
            expect(toDeleted.status).toBe(HttpStatus.NOT_FOUND);
            expect(toDeleted.body).toEqual(PRODUCT_NOT_FOUND);

            const relinked = await patch(ALICE, sale.id, { productId: other.id });
            expect(relinked.status).toBe(HttpStatus.OK);
            expect(relinked.body).toEqual({
                ...orphan,
                productId: other.id,
                productName: 'Beijinho',
                unitPrice: 2.5,
                quantity: 4,
                total: 10,
                profit: 10,
                date: '2026-10-23',
            });
        });

        it('changing the date keeps the local time of day (also across the UTC day boundary)', async () => {
            const aliceId = await userIdOf(ALICE);
            const id = await seedSale(aliceId, { occurred_at: '2026-10-25T02:30:15.250Z' }); // Oct 24 23:30:15.250

            const response = await patch(ALICE, id, { date: '2026-10-20' });
            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body).toMatchObject({ id, date: '2026-10-20', time: '23:30' });

            const row = await ctx.prisma.sale.findUniqueOrThrow({ where: { id } });
            expect(row.occurred_at.toISOString()).toBe('2026-10-21T02:30:15.250Z');

            expect((await listOk(ALICE, { date: '2026-10-20' })).items.map((s) => s.id)).toEqual([id]);
            expect((await listOk(ALICE, { date: '2026-10-24' })).items).toEqual([]);
        });

        it('quantity-only edit recomputes the total in cents and leaves occurred_at alone', async () => {
            const aliceId = await userIdOf(ALICE);
            const id = await seedSale(aliceId, {
                occurred_at: '2026-10-24T15:00:00.000Z',
                unit_price_cents: 10,
                quantity: 1,
            });

            const response = await patch(ALICE, id, { quantity: 3 });
            expect(response.status).toBe(HttpStatus.OK);
            expect(response.body).toMatchObject({
                unitPrice: 0.1,
                quantity: 3,
                total: 0.3,
                date: '2026-10-24',
                time: '12:00',
            });
            const row = await ctx.prisma.sale.findUniqueOrThrow({ where: { id } });
            expect(row.occurred_at.toISOString()).toBe('2026-10-24T15:00:00.000Z');
        });

        it('404 SALE_NOT_FOUND for another user’s or a missing sale, leaving the row untouched', async () => {
            const bobId = await userIdOf(BOB);
            const bobsSale = await seedSale(bobId, { occurred_at: '2026-10-24T15:00:00.000Z', quantity: 2 });
            const before = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: bobsSale } });

            for (const id of [bobsSale, randomUUID()]) {
                const response = await patch(ALICE, id, { quantity: 9 });
                expect(response.status).toBe(HttpStatus.NOT_FOUND);
                expect(response.body).toEqual(SALE_NOT_FOUND);
            }

            expect(await ctx.prisma.sale.findUniqueOrThrow({ where: { id: bobsSale } })).toEqual(before);
        });

        it('cannot relink a sale to another user’s product', async () => {
            const aliceId = await userIdOf(ALICE);
            const bobsProduct = await createProduct(BOB, 'Brownie', 8);
            const id = await seedSale(aliceId, { occurred_at: '2026-10-24T15:00:00.000Z' });

            const response = await patch(ALICE, id, { productId: bobsProduct.id });
            expect(response.status).toBe(HttpStatus.NOT_FOUND);
            expect(response.body).toEqual(PRODUCT_NOT_FOUND);
            expect(await ctx.prisma.sale.findUniqueOrThrow({ where: { id } })).toMatchObject({
                product_id: null,
                product_name_snapshot: 'Brigadeiro',
            });
        });

        it('400 for null productId, forbidden fields or a non-UUID id', async () => {
            const aliceId = await userIdOf(ALICE);
            const id = await seedSale(aliceId, { occurred_at: '2026-10-24T15:00:00.000Z' });

            const nullProduct = await patch(ALICE, id, { productId: null });
            expect(nullProduct.status).toBe(HttpStatus.BAD_REQUEST);
            expect(nullProduct.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

            const forged = await patch(ALICE, id, { unitPrice: 0.01 });
            expect(forged.status).toBe(HttpStatus.BAD_REQUEST);
            expect(forged.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field: 'unitPrice', message: 'Campo não permitido.' }],
                },
            });

            const badId = await patch(ALICE, 'not-a-uuid', { quantity: 2 });
            expect(badId.status).toBe(HttpStatus.BAD_REQUEST);
            expect(badId.body).toMatchObject({ error: { code: 'VALIDATION_ERROR' } });

            expect(await ctx.prisma.sale.findUniqueOrThrow({ where: { id } })).toMatchObject({
                unit_price_cents: 300,
                quantity: 1,
            });
        });
    });

    describe('DELETE /api/sales/:id', () => {
        it('204 then 404 SALE_NOT_FOUND; the row is gone', async () => {
            const aliceId = await userIdOf(ALICE);
            const id = await seedSale(aliceId, { occurred_at: '2026-10-24T15:00:00.000Z' });
            const keep = await seedSale(aliceId, { occurred_at: '2026-10-24T16:00:00.000Z' });

            const first = await request(server()).delete(`/api/sales/${id}`).set(authAs(ALICE));
            expect(first.status).toBe(HttpStatus.NO_CONTENT);
            expect(first.text).toBe('');

            const second = await request(server()).delete(`/api/sales/${id}`).set(authAs(ALICE));
            expect(second.status).toBe(HttpStatus.NOT_FOUND);
            expect(second.body).toEqual(SALE_NOT_FOUND);

            expect((await ctx.prisma.sale.findMany()).map((s) => s.id)).toEqual([keep]);
        });

        it('404 for another user’s sale and leaves it in place', async () => {
            const bobId = await userIdOf(BOB);
            const bobsSale = await seedSale(bobId, { occurred_at: '2026-10-24T15:00:00.000Z' });

            const response = await request(server()).delete(`/api/sales/${bobsSale}`).set(authAs(ALICE));
            expect(response.status).toBe(HttpStatus.NOT_FOUND);
            expect(response.body).toEqual(SALE_NOT_FOUND);
            expect(await ctx.prisma.sale.count({ where: { id: bobsSale } })).toBe(1);
        });
    });
});
