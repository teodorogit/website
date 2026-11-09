import { HttpStatus } from '@nestjs/common';
import request from 'supertest';
import { MAX_PRODUCTS_PER_USER } from '@/modules/products/products.service';
import { IntegrationApp, authAs, createIntegrationApp, resetDatabase } from './int-app.util';

const ALICE = 'user_alice';
const BOB = 'user_bob';

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const LOCAL_TIME = /^\d{2}:\d{2}$/;
const MISSING_ID = '7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b';

const nameConflict = { error: { code: 'PRODUCT_NAME_CONFLICT', message: 'Já existe um produto com este nome.' } };
const notFound = { error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' } };
const nameTooLong = {
    error: {
        code: 'VALIDATION_ERROR',
        message: 'Revise os campos enviados.',
        details: [{ field: 'name', message: 'Deve ter no máximo 32 caracteres.' }],
    },
};

type ProductBody = {
    id: string;
    name: string;
    price: number;
    preparationCost: number;
    createdAt: string;
    updatedAt: string;
};

describe('Products (integration, real PostgreSQL)', () => {
    let ctx: IntegrationApp;

    const http = () => request(ctx.app.getHttpServer());

    async function createProduct(clerkUserId: string, body: Record<string, unknown>): Promise<ProductBody> {
        const response = await http()
            .post('/api/products')
            .set(authAs(clerkUserId))
            .send(body)
            .expect(HttpStatus.CREATED);
        return response.body as ProductBody;
    }

    async function userIdOf(clerkUserId: string): Promise<string> {
        const user = await ctx.prisma.user.findUniqueOrThrow({ where: { clerk_user_id: clerkUserId } });
        return user.id;
    }

    beforeAll(async () => {
        ctx = await createIntegrationApp();
    });

    afterAll(async () => {
        await ctx.app.close();
    });

    beforeEach(async () => {
        await resetDatabase(ctx.prisma);
    });

    describe('CRUD over HTTP', () => {
        it('POST → 201 with the exact shape, trimmed name, default cost 0 and a matching row', async () => {
            const response = await http()
                .post('/api/products')
                .set(authAs(ALICE))
                .send({ name: '  Brownie  ', price: 8.5 })
                .expect(HttpStatus.CREATED);

            expect(response.body).toEqual({
                id: expect.stringMatching(UUID),
                name: 'Brownie',
                price: 8.5,
                preparationCost: 0,
                createdAt: expect.stringMatching(ISO_INSTANT),
                updatedAt: expect.stringMatching(ISO_INSTANT),
            });
            expect(Object.keys(response.body as object).sort()).toEqual(
                ['createdAt', 'id', 'name', 'preparationCost', 'price', 'updatedAt'].sort(),
            );

            const rows = await ctx.prisma.product.findMany();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toEqual({
                id: response.body.id,
                user_id: await userIdOf(ALICE),
                name: 'Brownie',
                price_cents: 850,
                preparation_cost_cents: 0,
                created_at: new Date(response.body.createdAt as string),
                updated_at: new Date(response.body.updatedAt as string),
            });
        });

        it('GET → 200 { items } with only the caller’s products', async () => {
            const brownie = await createProduct(ALICE, { name: 'Brownie', price: 8, preparationCost: 2.5 });
            await createProduct(BOB, { name: 'Cocada', price: 4 });

            const response = await http().get('/api/products').set(authAs(ALICE)).expect(HttpStatus.OK);

            expect(response.body).toEqual({ items: [brownie] });
            expect(brownie).toMatchObject({ name: 'Brownie', price: 8, preparationCost: 2.5 });
        });

        it('PATCH → 200 with the updated product, persisted, created_at kept and updated_at advanced', async () => {
            const created = await createProduct(ALICE, { name: 'Brownie', price: 8, preparationCost: 2 });

            const response = await http()
                .patch(`/api/products/${created.id}`)
                .set(authAs(ALICE))
                .send({ name: 'Brownie de Nozes', price: 9.5, preparationCost: 3.25 })
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({
                id: created.id,
                name: 'Brownie de Nozes',
                price: 9.5,
                preparationCost: 3.25,
                createdAt: created.createdAt,
                updatedAt: expect.stringMatching(ISO_INSTANT),
            });
            expect(new Date(response.body.updatedAt as string).getTime()).toBeGreaterThan(
                new Date(created.updatedAt).getTime(),
            );

            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: created.id } });
            expect(row).toMatchObject({ name: 'Brownie de Nozes', price_cents: 950, preparation_cost_cents: 325 });
        });

        it('PATCH with a partial body changes only the sent field', async () => {
            const created = await createProduct(ALICE, { name: 'Brownie', price: 8, preparationCost: 2 });

            const response = await http()
                .patch(`/api/products/${created.id}`)
                .set(authAs(ALICE))
                .send({ price: 10 })
                .expect(HttpStatus.OK);

            expect(response.body).toMatchObject({ id: created.id, name: 'Brownie', price: 10, preparationCost: 2 });
            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: created.id } });
            expect(row).toMatchObject({ name: 'Brownie', price_cents: 1000, preparation_cost_cents: 200 });
        });

        it('PATCH with an empty body → 200 with the product unchanged (updated_at not bumped)', async () => {
            const created = await createProduct(ALICE, { name: 'Brownie', price: 8 });

            const response = await http()
                .patch(`/api/products/${created.id}`)
                .set(authAs(ALICE))
                .send({})
                .expect(HttpStatus.OK);

            expect(response.body).toEqual(created);
        });

        it('DELETE → 204 with an empty body and the row gone; a second DELETE → 404', async () => {
            const created = await createProduct(ALICE, { name: 'Brownie', price: 8 });

            const response = await http()
                .delete(`/api/products/${created.id}`)
                .set(authAs(ALICE))
                .expect(HttpStatus.NO_CONTENT);

            expect(response.text).toBe('');
            expect(await ctx.prisma.product.count()).toBe(0);

            const again = await http()
                .delete(`/api/products/${created.id}`)
                .set(authAs(ALICE))
                .expect(HttpStatus.NOT_FOUND);
            expect(again.body).toEqual(notFound);
        });

        it('PATCH/DELETE of a missing id → 404 PRODUCT_NOT_FOUND', async () => {
            const patch = await http()
                .patch(`/api/products/${MISSING_ID}`)
                .set(authAs(ALICE))
                .send({ price: 9 })
                .expect(HttpStatus.NOT_FOUND);
            expect(patch.body).toEqual(notFound);

            const emptyPatch = await http()
                .patch(`/api/products/${MISSING_ID}`)
                .set(authAs(ALICE))
                .send({})
                .expect(HttpStatus.NOT_FOUND);
            expect(emptyPatch.body).toEqual(notFound);

            const remove = await http()
                .delete(`/api/products/${MISSING_ID}`)
                .set(authAs(ALICE))
                .expect(HttpStatus.NOT_FOUND);
            expect(remove.body).toEqual(notFound);
        });

        it('another user’s product is indistinguishable from a missing one and is left untouched', async () => {
            const bobs = await createProduct(BOB, { name: 'Cocada', price: 4 });

            const patch = await http()
                .patch(`/api/products/${bobs.id}`)
                .set(authAs(ALICE))
                .send({ name: 'Roubada', price: 1 })
                .expect(HttpStatus.NOT_FOUND);
            expect(patch.body).toEqual(notFound);

            const emptyPatch = await http()
                .patch(`/api/products/${bobs.id}`)
                .set(authAs(ALICE))
                .send({})
                .expect(HttpStatus.NOT_FOUND);
            expect(emptyPatch.body).toEqual(notFound);

            const remove = await http()
                .delete(`/api/products/${bobs.id}`)
                .set(authAs(ALICE))
                .expect(HttpStatus.NOT_FOUND);
            expect(remove.body).toEqual(notFound);

            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: bobs.id } });
            expect(row).toMatchObject({ name: 'Cocada', price_cents: 400, user_id: await userIdOf(BOB) });
        });
    });

    describe('case-insensitive name uniqueness (citext)', () => {
        it('POST "brownie" after "Brownie" → 409 PRODUCT_NAME_CONFLICT and no second row', async () => {
            await createProduct(ALICE, { name: 'Brownie', price: 8 });

            for (const name of ['brownie', 'BROWNIE', '  bRoWnIe ']) {
                const response = await http()
                    .post('/api/products')
                    .set(authAs(ALICE))
                    .send({ name, price: 9 })
                    .expect(HttpStatus.CONFLICT);
                expect(response.body).toEqual(nameConflict);
            }

            const rows = await ctx.prisma.product.findMany();
            expect(rows).toHaveLength(1);
            expect(rows[0]).toMatchObject({ name: 'Brownie', price_cents: 800 });
        });

        it('PATCH renaming onto another product’s name in another case → 409 and nothing changes', async () => {
            await createProduct(ALICE, { name: 'Brownie', price: 8 });
            const cocada = await createProduct(ALICE, { name: 'Cocada', price: 4 });

            const response = await http()
                .patch(`/api/products/${cocada.id}`)
                .set(authAs(ALICE))
                .send({ name: 'brownie', price: 5 })
                .expect(HttpStatus.CONFLICT);
            expect(response.body).toEqual(nameConflict);

            // The whole PATCH is rejected: the price in the same body was not applied either.
            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: cocada.id } });
            expect(row).toMatchObject({ name: 'Cocada', price_cents: 400 });
            expect(row.updated_at.toISOString()).toBe(cocada.updatedAt);
        });

        it('PATCH changing only the case of the product’s own name is allowed', async () => {
            const created = await createProduct(ALICE, { name: 'Brownie', price: 8 });

            const response = await http()
                .patch(`/api/products/${created.id}`)
                .set(authAs(ALICE))
                .send({ name: 'BROWNIE' })
                .expect(HttpStatus.OK);

            expect(response.body).toMatchObject({ id: created.id, name: 'BROWNIE' });
            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: created.id } });
            expect(row.name).toBe('BROWNIE');
        });

        it('the same name for two different users is allowed', async () => {
            const alices = await createProduct(ALICE, { name: 'Brownie', price: 8 });
            const bobs = await createProduct(BOB, { name: 'brownie', price: 7 });

            expect(bobs.id).not.toBe(alices.id);
            expect(bobs).toMatchObject({ name: 'brownie', price: 7 });

            const rows = await ctx.prisma.product.findMany({ orderBy: { price_cents: 'asc' } });
            expect(rows.map((r) => [r.user_id, r.name])).toEqual([
                [await userIdOf(BOB), 'brownie'],
                [await userIdOf(ALICE), 'Brownie'],
            ]);

            // Renaming onto a name only another user has is not a conflict either.
            const bobsCocada = await createProduct(BOB, { name: 'Cocada', price: 4 });
            const renamed = await http()
                .patch(`/api/products/${alices.id}`)
                .set(authAs(ALICE))
                .send({ name: 'COCADA' })
                .expect(HttpStatus.OK);
            expect(renamed.body).toMatchObject({ id: alices.id, name: 'COCADA' });

            const bobsList = await http().get('/api/products').set(authAs(BOB)).expect(HttpStatus.OK);
            expect((bobsList.body.items as ProductBody[]).map((p) => [p.id, p.name])).toEqual([
                [bobs.id, 'brownie'],
                [bobsCocada.id, 'Cocada'],
            ]);
        });
    });

    it('GET lists products ordered by name, case-insensitively', async () => {
        for (const name of ['brownie', 'Cocada', 'alfajor', 'Beijinho', 'BOLO de pote']) {
            await createProduct(ALICE, { name, price: 5 });
        }

        const response = await http().get('/api/products').set(authAs(ALICE)).expect(HttpStatus.OK);

        expect((response.body.items as ProductBody[]).map((p) => p.name)).toEqual([
            'alfajor',
            'Beijinho',
            'BOLO de pote',
            'brownie',
            'Cocada',
        ]);
    });

    describe('name length is measured in code points (32 max), never reaching the DB CHECK', () => {
        // 30 + "❤️" (U+2764 U+FE0F: 2 code points) = 32 code points.
        const name32WithVariationSelector = `${'a'.repeat(30)}❤️`;
        // 31 + "🍫" (1 code point, 2 UTF-16 units) = 32 code points but 33 UTF-16 units.
        const name32WithAstralEmoji = `${'b'.repeat(31)}🍫`;
        // 31 + "❤️" = 33 code points; validator.js isLength would count only 32.
        const name33WithVariationSelector = `${'c'.repeat(31)}❤️`;
        // 32 + "🍫" = 33 code points.
        const name33WithAstralEmoji = `${'d'.repeat(32)}🍫`;

        // Needs a UTF8 cluster: global-setup.mjs passes `--encoding=UTF8` to initdb.
        it.each([
            ['variation-selector emoji', name32WithVariationSelector],
            ['astral emoji', name32WithAstralEmoji],
        ])('32 code points with %s → 201 and stored intact', async (_label, name) => {
            const created = await createProduct(ALICE, { name, price: 5 });
            expect(created.name).toBe(name);

            const [row] = await ctx.prisma.$queryRaw<{ name: string; length: number }[]>`
                SELECT name::text AS name, char_length(name) AS length FROM products WHERE id = ${created.id}::uuid`;
            expect(row).toEqual({ name, length: 32 });
        });

        it.each([
            ['variation-selector emoji', name33WithVariationSelector],
            ['astral emoji', name33WithAstralEmoji],
            ['plain ASCII', 'x'.repeat(33)],
        ])('33 code points with %s → 400 VALIDATION_ERROR on POST and PATCH', async (_label, name) => {
            const created = await http()
                .post('/api/products')
                .set(authAs(ALICE))
                .send({ name, price: 5 })
                .expect(HttpStatus.BAD_REQUEST);
            expect(created.body).toEqual(nameTooLong);
            expect(await ctx.prisma.product.count()).toBe(0);

            const existing = await createProduct(ALICE, { name: 'Brownie', price: 5 });
            const patched = await http()
                .patch(`/api/products/${existing.id}`)
                .set(authAs(ALICE))
                .send({ name })
                .expect(HttpStatus.BAD_REQUEST);
            expect(patched.body).toEqual(nameTooLong);

            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: existing.id } });
            expect(row.name).toBe('Brownie');
        });

        it('a sale of a 32-code-point product snapshots the full name (varchar(32) holds it)', async () => {
            const product = await createProduct(ALICE, { name: name32WithVariationSelector, price: 5 });

            const sale = await http()
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 1, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);

            expect(sale.body).toMatchObject({ productName: name32WithVariationSelector });
        });
    });

    describe('catalog size cap (MAX_PRODUCTS_PER_USER)', () => {
        const limitReached = {
            error: {
                code: 'PRODUCT_LIMIT_REACHED',
                message: 'Você atingiu o limite de produtos cadastrados. Remova um produto para cadastrar outro.',
            },
        };

        async function seedProducts(clerkUserId: string, count: number): Promise<void> {
            await http().get('/api/products').set(authAs(clerkUserId)).expect(HttpStatus.OK);
            const user_id = await userIdOf(clerkUserId);
            await ctx.prisma.product.createMany({
                data: Array.from({ length: count }, (_, index) => ({
                    user_id,
                    name: `Seed ${String(index).padStart(3, '0')}`,
                    price_cents: 100,
                })),
            });
        }

        it('concurrent POSTs at the edge create exactly one product; the rest get 409 PRODUCT_LIMIT_REACHED', async () => {
            await seedProducts(ALICE, MAX_PRODUCTS_PER_USER - 1);

            const responses = await Promise.all(
                Array.from({ length: 6 }, (_, index) =>
                    http()
                        .post('/api/products')
                        .set(authAs(ALICE))
                        .send({ name: `Novo ${index}`, price: 5 }),
                ),
            );

            const statuses = responses.map((response) => response.status).sort();
            expect(statuses).toEqual([201, 409, 409, 409, 409, 409]);
            for (const response of responses.filter((r) => r.status === HttpStatus.CONFLICT)) {
                expect(response.body).toEqual(limitReached);
            }
            expect(await ctx.prisma.product.count({ where: { user_id: await userIdOf(ALICE) } })).toBe(
                MAX_PRODUCTS_PER_USER,
            );
        });

        it('deleting a product frees a slot; other users are not affected', async () => {
            await seedProducts(ALICE, MAX_PRODUCTS_PER_USER);

            await http()
                .post('/api/products')
                .set(authAs(ALICE))
                .send({ name: 'Excedente', price: 5 })
                .expect(HttpStatus.CONFLICT);
            await createProduct(BOB, { name: 'Excedente', price: 5 });

            const victim = await ctx.prisma.product.findFirstOrThrow({ where: { user_id: await userIdOf(ALICE) } });
            await http().delete(`/api/products/${victim.id}`).set(authAs(ALICE)).expect(HttpStatus.NO_CONTENT);
            await createProduct(ALICE, { name: 'Excedente', price: 5 });
        });
    });

    describe('money round-trips exactly through integer cents', () => {
        it.each([
            [0.29, 0.29, 29, 29],
            [8.1, 8.1, 810, 810],
            [999999.99, 999999.99, 99_999_999, 99_999_999],
            [0.01, 0, 1, 0],
            [1_000_000, 1_000_000, 100_000_000, 100_000_000],
            // Binary-float noise a JS client can send (0.1 + 0.2, 0.07 * 100 = 7.000…1) lands on the exact cent.
            [0.1 + 0.2, 0.07, 30, 7],
        ])('price %p / preparationCost %p', async (price, preparationCost, priceCents, costCents) => {
            const created = await createProduct(ALICE, { name: 'Produto', price, preparationCost });

            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: created.id } });
            expect(row.price_cents).toBe(priceCents);
            expect(row.preparation_cost_cents).toBe(costCents);

            expect(created).toMatchObject({ price: priceCents / 100, preparationCost: costCents / 100 });

            const listed = await http().get('/api/products').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(listed.body.items).toEqual([created]);
        });

        it.each([
            [0.29, 29],
            [8.1, 810],
            [999999.99, 99_999_999],
        ])('PATCH price %p → %p cents and back', async (price, cents) => {
            const created = await createProduct(ALICE, { name: 'Produto', price: 1, preparationCost: 1 });

            const response = await http()
                .patch(`/api/products/${created.id}`)
                .set(authAs(ALICE))
                .send({ price, preparationCost: price })
                .expect(HttpStatus.OK);

            expect(response.body).toMatchObject({ price, preparationCost: price });
            const row = await ctx.prisma.product.findUniqueOrThrow({ where: { id: created.id } });
            expect(row).toMatchObject({ price_cents: cents, preparation_cost_cents: cents });
        });
    });

    describe('sales keep their snapshot', () => {
        it('changing a product’s price (and name) does not alter existing sales', async () => {
            const product = await createProduct(ALICE, { name: 'Brownie', price: 8.1 });

            const created = await http()
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 3, date: '2026-10-24' })
                .expect(HttpStatus.CREATED);

            expect(created.body).toEqual({
                id: expect.stringMatching(UUID),
                productId: product.id,
                productName: 'Brownie',
                unitPrice: 8.1,
                quantity: 3,
                total: 24.3,
                date: '2026-10-24',
                time: expect.stringMatching(LOCAL_TIME),
            });

            await http()
                .patch(`/api/products/${product.id}`)
                .set(authAs(ALICE))
                .send({ price: 12.99, name: 'Brownie Gourmet' })
                .expect(HttpStatus.OK);

            const listed = await http().get('/api/sales').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(listed.body).toEqual({ items: [created.body], nextCursor: null });

            const saleRow = await ctx.prisma.sale.findUniqueOrThrow({ where: { id: created.body.id as string } });
            expect(saleRow).toMatchObject({
                product_id: product.id,
                product_name_snapshot: 'Brownie',
                unit_price_cents: 810,
                quantity: 3,
            });

            // A new sale after the change snapshots the new price; the old one still does not move.
            const newer = await http()
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 1, date: '2026-10-25' })
                .expect(HttpStatus.CREATED);
            expect(newer.body).toMatchObject({ productName: 'Brownie Gourmet', unitPrice: 12.99, total: 12.99 });

            const after = await http().get('/api/sales').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(after.body).toEqual({ items: [newer.body, created.body], nextCursor: null });
        });

        it('DELETE keeps sales readable with productId null and the original name/price snapshot', async () => {
            const product = await createProduct(ALICE, { name: 'Brownie', price: 0.29 });
            const other = await createProduct(ALICE, { name: 'Cocada', price: 4 });
            const aliceId = await userIdOf(ALICE);

            // Precise instants seeded directly: 2026-10-24 15:30 and 2026-10-23 09:05 in São Paulo (UTC−3).
            const seeded = await ctx.prisma.sale.create({
                data: {
                    user_id: aliceId,
                    product_id: product.id,
                    product_name_snapshot: 'Brownie',
                    unit_price_cents: 29,
                    quantity: 7,
                    occurred_at: new Date('2026-10-24T18:30:00.000Z'),
                },
            });
            const untouched = await ctx.prisma.sale.create({
                data: {
                    user_id: aliceId,
                    product_id: other.id,
                    product_name_snapshot: 'Cocada',
                    unit_price_cents: 400,
                    quantity: 1,
                    occurred_at: new Date('2026-10-23T12:05:00.000Z'),
                },
            });
            const viaHttp = await http()
                .post('/api/sales')
                .set(authAs(ALICE))
                .send({ productId: product.id, quantity: 2, date: '2026-10-22' })
                .expect(HttpStatus.CREATED);

            await http().delete(`/api/products/${product.id}`).set(authAs(ALICE)).expect(HttpStatus.NO_CONTENT);

            const listed = await http().get('/api/sales').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(listed.body).toEqual({
                items: [
                    {
                        id: seeded.id,
                        productId: null,
                        productName: 'Brownie',
                        unitPrice: 0.29,
                        quantity: 7,
                        total: 2.03,
                        date: '2026-10-24',
                        time: '15:30',
                    },
                    {
                        id: untouched.id,
                        productId: other.id,
                        productName: 'Cocada',
                        unitPrice: 4,
                        quantity: 1,
                        total: 4,
                        date: '2026-10-23',
                        time: '09:05',
                    },
                    { ...viaHttp.body, productId: null },
                ],
                nextCursor: null,
            });

            const rows = await ctx.prisma.sale.findMany({ orderBy: { occurred_at: 'desc' } });
            expect(rows).toHaveLength(3);
            expect(rows.map((r) => [r.product_id, r.product_name_snapshot, r.unit_price_cents, r.quantity])).toEqual([
                [null, 'Brownie', 29, 7],
                [other.id, 'Cocada', 400, 1],
                [null, 'Brownie', 29, 2],
            ]);
            expect(await ctx.prisma.product.findUnique({ where: { id: product.id } })).toBeNull();

            // A new product may reuse the deleted name; old sales stay unlinked.
            const reborn = await createProduct(ALICE, { name: 'brownie', price: 10 });
            expect(reborn.id).not.toBe(product.id);
            const relisted = await http().get('/api/sales').set(authAs(ALICE)).expect(HttpStatus.OK);
            expect(relisted.body).toEqual(listed.body);
        });
    });
});
