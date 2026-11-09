import { ConflictException, HttpStatus, INestApplication, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { ERROR_CODE } from '@/common/errors/error-code';
import { createE2eApp } from '@/common/test/e2e-app.util';
import { AUTH_HEADER, authenticateAs } from '@/modules/auth/test/utils/test.utils';
import { otherUser } from '@/modules/users/test/utils/test.utils';
import { ProductsModule } from '../products.module';
import { ProductsService } from '../products.service';
import { defaultProduct, mockedProductsService, product_id } from './utils/test.utils';

const expectedProduct = {
    id: product_id,
    name: 'Brigadeiro',
    price: 3,
    preparationCost: 0,
    createdAt: '2026-10-24T12:00:00.000Z',
    updatedAt: '2026-10-24T12:00:00.000Z',
};

const validationError = (field: string, message: string) => ({
    error: {
        code: 'VALIDATION_ERROR',
        message: 'Revise os campos enviados.',
        details: [{ field, message }],
    },
});

const notFound = { error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' } };
const nameConflict = { error: { code: 'PRODUCT_NAME_CONFLICT', message: 'Já existe um produto com este nome.' } };

/** Rules shared by POST and PATCH (BACKEND_SCOPE.md §2 "Produtos"). */
const fieldRules: Array<[string, Record<string, unknown>, string, string]> = [
    ['empty name after trimming', { name: '   ' }, 'name', 'Não pode ser vazio.'],
    ['name longer than 32 characters', { name: 'x'.repeat(33) }, 'name', 'Deve ter no máximo 32 caracteres.'],
    // 40 code points (Postgres char_length) but 20 for validator.js isLength, which skips U+FE0F.
    ['name of variation-selector emoji', { name: '❤️'.repeat(20) }, 'name', 'Deve ter no máximo 32 caracteres.'],
    [
        'name over 32 code points once emoji are counted',
        { name: `${'x'.repeat(28)} ❤️❤️` },
        'name',
        'Deve ter no máximo 32 caracteres.',
    ],
    ['non-string name', { name: 123 }, 'name', 'Deve ser um texto.'],
    ['null name', { name: null }, 'name', 'Deve ser um texto.'],
    ['name with a NUL character', { name: `Bolo${String.fromCharCode(0)}X` }, 'name', 'Contém caracteres inválidos.'],
    [
        'name with a lone surrogate',
        { name: `Bolo${String.fromCharCode(0xdc00)}` },
        'name',
        'Contém caracteres inválidos.',
    ],
    ['zero price', { price: 0 }, 'price', 'Deve ser maior que 0.'],
    ['negative price', { price: -1 }, 'price', 'Deve ser maior que 0.'],
    [
        'price with more than two decimals',
        { price: 1.234 },
        'price',
        'Deve ser um valor numérico com no máximo duas casas decimais.',
    ],
    // JSON exponent fractions used to crash IsNumber({ maxDecimalPlaces }) into a 500.
    [
        'price in exponent form',
        { price: 1e-7 },
        'price',
        'Deve ser um valor numérico com no máximo duas casas decimais.',
    ],
    ['price 5e-7', { price: 5e-7 }, 'price', 'Deve ser um valor numérico com no máximo duas casas decimais.'],
    [
        'preparation cost in exponent form',
        { preparationCost: 1e-7 },
        'preparationCost',
        'Deve ser um valor numérico com no máximo duas casas decimais.',
    ],
    [
        'price sent as a string',
        { price: '8' },
        'price',
        'Deve ser um valor numérico com no máximo duas casas decimais.',
    ],
    ['null price', { price: null }, 'price', 'Deve ser um valor numérico com no máximo duas casas decimais.'],
    ['price above the money ceiling', { price: 1_000_000.01 }, 'price', 'Deve ser menor ou igual a 1000000.'],
    ['negative preparation cost', { preparationCost: -0.01 }, 'preparationCost', 'Deve ser maior ou igual a 0.'],
    [
        'null preparation cost',
        { preparationCost: null },
        'preparationCost',
        'Deve ser um valor numérico com no máximo duas casas decimais.',
    ],
    [
        'preparation cost with more than two decimals',
        { preparationCost: 0.001 },
        'preparationCost',
        'Deve ser um valor numérico com no máximo duas casas decimais.',
    ],
    ['client-sent userId', { userId: 'someone-else' }, 'userId', 'Campo não permitido.'],
    ['unknown field', { stock: 10 }, 'stock', 'Campo não permitido.'],
];

describe('Products (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        app = await createE2eApp({
            imports: [ProductsModule],
            overrides: [{ provide: ProductsService, useValue: mockedProductsService }],
        });
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('authentication', () => {
        it.each([
            ['GET', '/api/products'],
            ['POST', '/api/products'],
            ['PATCH', `/api/products/${product_id}`],
            ['DELETE', `/api/products/${product_id}`],
        ])('%s %s → 401 without a token', async (method, path) => {
            const response = await request(app.getHttpServer())
                [method.toLowerCase() as 'get' | 'post' | 'patch' | 'delete'](path)
                .expect(HttpStatus.UNAUTHORIZED);

            expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' } });
            expect(mockedProductsService.findAll).not.toHaveBeenCalled();
            expect(mockedProductsService.create).not.toHaveBeenCalled();
            expect(mockedProductsService.update).not.toHaveBeenCalled();
            expect(mockedProductsService.remove).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/products', () => {
        it('200 { items } in reais and camelCase, without user_id or cents', async () => {
            const authUser = authenticateAs();
            mockedProductsService.findAll.mockResolvedValueOnce([
                defaultProduct(),
                defaultProduct({
                    id: '44444444-4444-4444-8444-444444444444',
                    name: 'Brownie',
                    price_cents: 850,
                    preparation_cost_cents: 229,
                }),
            ]);

            const response = await request(app.getHttpServer())
                .get('/api/products')
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({
                items: [
                    expectedProduct,
                    {
                        ...expectedProduct,
                        id: '44444444-4444-4444-8444-444444444444',
                        name: 'Brownie',
                        price: 8.5,
                        preparationCost: 2.29,
                    },
                ],
            });
            expect(mockedProductsService.findAll).toHaveBeenCalledWith(authUser);
        });

        it('200 { items: [] } when the user has no products', async () => {
            authenticateAs();
            mockedProductsService.findAll.mockResolvedValueOnce([]);

            const response = await request(app.getHttpServer())
                .get('/api/products')
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ items: [] });
        });

        it('passes the user derived from the token, whoever it is', async () => {
            const authUser = authenticateAs(otherUser());
            mockedProductsService.findAll.mockResolvedValueOnce([]);

            await request(app.getHttpServer()).get('/api/products').set(AUTH_HEADER).expect(HttpStatus.OK);

            expect(mockedProductsService.findAll).toHaveBeenCalledWith(authUser);
        });
    });

    describe('POST /api/products', () => {
        const validBody = { name: 'Brownie', price: 8, preparationCost: 2.5 };

        it('201 with the created product', async () => {
            const authUser = authenticateAs();
            mockedProductsService.create.mockResolvedValueOnce(
                defaultProduct({ name: 'Brownie', price_cents: 800, preparation_cost_cents: 250 }),
            );

            const response = await request(app.getHttpServer())
                .post('/api/products')
                .set(AUTH_HEADER)
                .send(validBody)
                .expect(HttpStatus.CREATED);

            expect(response.body).toEqual({ ...expectedProduct, name: 'Brownie', price: 8, preparationCost: 2.5 });
            expect(mockedProductsService.create).toHaveBeenCalledWith(authUser, validBody);
        });

        it('trims the name and accepts a body without preparationCost', async () => {
            const authUser = authenticateAs();
            mockedProductsService.create.mockResolvedValueOnce(defaultProduct());

            await request(app.getHttpServer())
                .post('/api/products')
                .set(AUTH_HEADER)
                .send({ name: '  Brigadeiro  ', price: 3 })
                .expect(HttpStatus.CREATED);

            const [, dto] = mockedProductsService.create.mock.calls[0] as [unknown, Record<string, unknown>];
            expect(mockedProductsService.create).toHaveBeenCalledWith(authUser, expect.anything());
            expect(dto['name']).toBe('Brigadeiro');
            expect(dto['price']).toBe(3);
            expect(dto['preparationCost']).toBeUndefined();
        });

        it('accepts the boundaries: 32-character name, price 0.01, cost 0', async () => {
            authenticateAs();
            mockedProductsService.create.mockResolvedValueOnce(defaultProduct());

            await request(app.getHttpServer())
                .post('/api/products')
                .set(AUTH_HEADER)
                .send({ name: 'x'.repeat(32), price: 0.01, preparationCost: 0 })
                .expect(HttpStatus.CREATED);
        });

        it('accepts a 32-code-point name ending in a variation-selector emoji', async () => {
            authenticateAs();
            mockedProductsService.create.mockResolvedValueOnce(defaultProduct());
            const name = `${'x'.repeat(30)}❤️`;

            await request(app.getHttpServer())
                .post('/api/products')
                .set(AUTH_HEADER)
                .send({ name, price: 3 })
                .expect(HttpStatus.CREATED);

            const [, dto] = mockedProductsService.create.mock.calls[0] as [unknown, Record<string, unknown>];
            expect(dto['name']).toBe(name);
        });

        it.each([
            ['missing name', { price: 3 }, 'name', 'Deve ser um texto.'],
            [
                'missing price',
                { name: 'Brownie' },
                'price',
                'Deve ser um valor numérico com no máximo duas casas decimais.',
            ],
        ])('400 VALIDATION_ERROR for %s', async (_case, body, field, message) => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .post('/api/products')
                .set(AUTH_HEADER)
                .send(body)
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual(validationError(field, message));
            expect(mockedProductsService.create).not.toHaveBeenCalled();
        });

        it.each(fieldRules)('400 VALIDATION_ERROR for %s', async (_case, override, field, message) => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .post('/api/products')
                .set(AUTH_HEADER)
                .send({ ...validBody, ...override })
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual(validationError(field, message));
            expect(mockedProductsService.create).not.toHaveBeenCalled();
        });

        it('409 PRODUCT_NAME_CONFLICT envelope', async () => {
            authenticateAs();
            mockedProductsService.create.mockRejectedValueOnce(new ConflictException(ERROR_CODE.PRODUCT_NAME_CONFLICT));

            const response = await request(app.getHttpServer())
                .post('/api/products')
                .set(AUTH_HEADER)
                .send(validBody)
                .expect(HttpStatus.CONFLICT);

            expect(response.body).toEqual(nameConflict);
        });
    });

    describe('PATCH /api/products/:id', () => {
        it('200 with the updated product', async () => {
            const authUser = authenticateAs();
            mockedProductsService.update.mockResolvedValueOnce(defaultProduct({ price_cents: 350 }));

            const response = await request(app.getHttpServer())
                .patch(`/api/products/${product_id}`)
                .set(AUTH_HEADER)
                .send({ price: 3.5 })
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ ...expectedProduct, price: 3.5 });
            expect(mockedProductsService.update).toHaveBeenCalledWith(authUser, product_id, { price: 3.5 });
        });

        it('200 for an empty body (no-op handled by the service)', async () => {
            const authUser = authenticateAs();
            mockedProductsService.update.mockResolvedValueOnce(defaultProduct());

            const response = await request(app.getHttpServer())
                .patch(`/api/products/${product_id}`)
                .set(AUTH_HEADER)
                .send({})
                .expect(HttpStatus.OK);

            expect(response.body).toEqual(expectedProduct);
            expect(mockedProductsService.update).toHaveBeenCalledWith(authUser, product_id, {});
        });

        it.each(fieldRules)('400 VALIDATION_ERROR for %s', async (_case, body, field, message) => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .patch(`/api/products/${product_id}`)
                .set(AUTH_HEADER)
                .send(body)
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual(validationError(field, message));
            expect(mockedProductsService.update).not.toHaveBeenCalled();
        });

        it('400 VALIDATION_ERROR for a malformed id, before the service runs', async () => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .patch('/api/products/not-a-uuid')
                .set(AUTH_HEADER)
                .send({ price: 3.5 })
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual(validationError('id', 'Deve ser um UUID válido.'));
            expect(mockedProductsService.update).not.toHaveBeenCalled();
        });

        it("404 PRODUCT_NOT_FOUND envelope (missing or another user's)", async () => {
            authenticateAs();
            mockedProductsService.update.mockRejectedValueOnce(new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND));

            const response = await request(app.getHttpServer())
                .patch(`/api/products/${product_id}`)
                .set(AUTH_HEADER)
                .send({ name: 'Bombom' })
                .expect(HttpStatus.NOT_FOUND);

            expect(response.body).toEqual(notFound);
        });

        it('409 PRODUCT_NAME_CONFLICT envelope on rename', async () => {
            authenticateAs();
            mockedProductsService.update.mockRejectedValueOnce(new ConflictException(ERROR_CODE.PRODUCT_NAME_CONFLICT));

            const response = await request(app.getHttpServer())
                .patch(`/api/products/${product_id}`)
                .set(AUTH_HEADER)
                .send({ name: 'BROWNIE' })
                .expect(HttpStatus.CONFLICT);

            expect(response.body).toEqual(nameConflict);
        });
    });

    describe('DELETE /api/products/:id', () => {
        it('204 with an empty body', async () => {
            const authUser = authenticateAs();
            mockedProductsService.remove.mockResolvedValueOnce(undefined);

            const response = await request(app.getHttpServer())
                .delete(`/api/products/${product_id}`)
                .set(AUTH_HEADER)
                .expect(HttpStatus.NO_CONTENT);

            expect(response.body).toEqual({});
            expect(response.text).toBe('');
            expect(mockedProductsService.remove).toHaveBeenCalledWith(authUser, product_id);
        });

        it('400 VALIDATION_ERROR for a malformed id', async () => {
            authenticateAs();

            const response = await request(app.getHttpServer())
                .delete('/api/products/123')
                .set(AUTH_HEADER)
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual(validationError('id', 'Deve ser um UUID válido.'));
            expect(mockedProductsService.remove).not.toHaveBeenCalled();
        });

        it("404 PRODUCT_NOT_FOUND envelope (missing or another user's)", async () => {
            authenticateAs();
            mockedProductsService.remove.mockRejectedValueOnce(new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND));

            const response = await request(app.getHttpServer())
                .delete(`/api/products/${product_id}`)
                .set(AUTH_HEADER)
                .expect(HttpStatus.NOT_FOUND);

            expect(response.body).toEqual(notFound);
        });
    });
});
