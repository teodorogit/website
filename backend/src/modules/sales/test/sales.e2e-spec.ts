import { BadRequestException, HttpStatus, INestApplication, NotFoundException } from '@nestjs/common';
import request from 'supertest';
import { ERROR_CODE } from '@/common/errors/error-code';
import { createE2eApp } from '@/common/test/e2e-app.util';
import { AUTH_HEADER, authenticateAs } from '@/modules/auth/test/utils/test.utils';
import { otherUser } from '@/modules/users/test/utils/test.utils';
import { SalesModule } from '../sales.module';
import { SalesService } from '../sales.service';
import { defaultSale, mockedSalesService, product_id, sale_id } from './utils/test.utils';

const saleBody = {
    id: sale_id,
    productId: product_id,
    productName: 'Brigadeiro',
    unitPrice: 3,
    unitCost: 1,
    quantity: 2,
    total: 6,
    profit: 4,
    date: '2026-10-24',
    time: '12:30',
};

describe('Sales (e2e)', () => {
    let app: INestApplication;

    beforeAll(async () => {
        app = await createE2eApp({
            imports: [SalesModule],
            overrides: [{ provide: SalesService, useValue: mockedSalesService }],
        });
    });

    afterAll(async () => {
        await app.close();
    });

    beforeEach(() => {
        jest.resetAllMocks();
    });

    const server = () => app.getHttpServer();

    describe('authentication', () => {
        it.each([
            ['get', '/api/sales'],
            ['post', '/api/sales'],
            ['patch', `/api/sales/${sale_id}`],
            ['delete', `/api/sales/${sale_id}`],
        ] as const)('%s %s → 401 without a token', async (method, path) => {
            const response = await request(server())[method](path).expect(HttpStatus.UNAUTHORIZED);

            expect(response.body).toEqual({ error: { code: 'UNAUTHORIZED', message: 'Autenticação necessária.' } });
            expect(mockedSalesService.list).not.toHaveBeenCalled();
            expect(mockedSalesService.create).not.toHaveBeenCalled();
            expect(mockedSalesService.update).not.toHaveBeenCalled();
            expect(mockedSalesService.remove).not.toHaveBeenCalled();
        });
    });

    describe('GET /api/sales', () => {
        it('200 { items, nextCursor } with the snapshot rendered in the user timezone', async () => {
            const authUser = authenticateAs();
            mockedSalesService.list.mockResolvedValueOnce({ items: [defaultSale()], nextCursor: null });

            const response = await request(server())
                .get('/api/sales')
                .query({ date: '2026-10-24' })
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ items: [saleBody], nextCursor: null });
            expect(mockedSalesService.list).toHaveBeenCalledWith(authUser, { date: '2026-10-24' });
        });

        it('passes the range, numeric limit and cursor through and returns nextCursor', async () => {
            const authUser = authenticateAs();
            mockedSalesService.list.mockResolvedValueOnce({ items: [], nextCursor: 'next-page' });

            const response = await request(server())
                .get('/api/sales')
                .query({ startDate: '2026-10-01', endDate: '2026-10-31', limit: '10', cursor: 'abc' })
                .set(AUTH_HEADER)
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ items: [], nextCursor: 'next-page' });
            expect(mockedSalesService.list).toHaveBeenCalledWith(authUser, {
                startDate: '2026-10-01',
                endDate: '2026-10-31',
                limit: 10,
                cursor: 'abc',
            });
        });

        it('renders a deleted product as productId null and computes the total in cents', async () => {
            authenticateAs();
            mockedSalesService.list.mockResolvedValueOnce({
                items: [defaultSale({ product_id: null, unit_price_cents: 10, quantity: 3 })],
                nextCursor: null,
            });

            const response = await request(server()).get('/api/sales').set(AUTH_HEADER).expect(HttpStatus.OK);

            expect(response.body.items[0]).toEqual({
                ...saleBody,
                productId: null,
                unitPrice: 0.1,
                quantity: 3,
                total: 0.3,
                // (0.10 − 1.00) × 3: the fixture's unit cost is above this unit price.
                profit: -2.7,
            });
        });

        it.each([
            // In floats: 7.35 × 7 = 51.449999999999996.
            [
                { unit_price_cents: 735, unit_cost_cents: 0, quantity: 7 },
                { unitPrice: 7.35, unitCost: 0, total: 51.45, profit: 51.45 },
            ],
            // In floats: 19.99 × 7 = 139.92999999999998 and (19.99 − 7.35) × 7 = 88.47999999999999.
            [
                { unit_price_cents: 1999, unit_cost_cents: 735, quantity: 7 },
                { unitPrice: 19.99, unitCost: 7.35, total: 139.93, profit: 88.48 },
            ],
            // Sold below cost: the profit is negative, never clamped to zero.
            [
                { unit_price_cents: 735, unit_cost_cents: 1999, quantity: 7 },
                { unitPrice: 7.35, unitCost: 19.99, total: 51.45, profit: -88.48 },
            ],
            [
                { unit_price_cents: 300, unit_cost_cents: 300, quantity: 2 },
                { unitPrice: 3, unitCost: 3, total: 6, profit: 0 },
            ],
        ])('renders unitCost and profit computed in cents for %o', async (snapshot, money) => {
            authenticateAs();
            mockedSalesService.list.mockResolvedValueOnce({ items: [defaultSale(snapshot)], nextCursor: null });

            const response = await request(server()).get('/api/sales').set(AUTH_HEADER).expect(HttpStatus.OK);

            expect(response.body.items).toEqual([{ ...saleBody, ...money, quantity: snapshot.quantity }]);
        });

        it('serializes the sale fields in the contract order', async () => {
            authenticateAs();
            mockedSalesService.list.mockResolvedValueOnce({ items: [defaultSale()], nextCursor: null });

            const response = await request(server()).get('/api/sales').set(AUTH_HEADER).expect(HttpStatus.OK);

            expect(Object.keys(response.body.items[0])).toEqual([
                'id',
                'productId',
                'productName',
                'unitPrice',
                'unitCost',
                'quantity',
                'total',
                'profit',
                'date',
                'time',
            ]);
        });

        it.each([
            [{ date: '2026-02-30' }, 'date', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ startDate: '24/10/2026' }, 'startDate', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ endDate: '2026-1-5' }, 'endDate', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ limit: '0' }, 'limit', 'Deve ser maior ou igual a 1.'],
            [{ limit: '101' }, 'limit', 'Deve ser menor ou igual a 100.'],
            [{ userId: 'someone-else' }, 'userId', 'Campo não permitido.'],
        ])('400 VALIDATION_ERROR for %o', async (query, field, message) => {
            authenticateAs();

            const response = await request(server())
                .get('/api/sales')
                .query(query)
                .set(AUTH_HEADER)
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field, message }],
                },
            });
            expect(mockedSalesService.list).not.toHaveBeenCalled();
        });

        it('400 VALIDATION_ERROR for a non-numeric limit', async () => {
            authenticateAs();

            const response = await request(server())
                .get('/api/sales')
                .query({ limit: 'ten' })
                .set(AUTH_HEADER)
                .expect(HttpStatus.BAD_REQUEST);

            // The message comes from the shared CursorPaginationQuery; only the field is this module's contract.
            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toEqual([{ field: 'limit', message: expect.any(String) }]);
            expect(mockedSalesService.list).not.toHaveBeenCalled();
        });

        it.each([
            [ERROR_CODE.SALE_FILTER_CONFLICT, 'Use o filtro "date" ou o intervalo "startDate"/"endDate", não ambos.'],
            [ERROR_CODE.INVALID_DATE_RANGE, 'A data inicial deve ser anterior ou igual à data final.'],
            [ERROR_CODE.INVALID_CURSOR, 'Cursor de paginação inválido.'],
        ])('400 %s envelope from the service', async (code, message) => {
            authenticateAs();
            mockedSalesService.list.mockRejectedValueOnce(new BadRequestException(code));

            const response = await request(server()).get('/api/sales').set(AUTH_HEADER).expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({ error: { code, message } });
        });
    });

    describe('POST /api/sales', () => {
        const body = { productId: product_id, quantity: 2, date: '2026-10-24' };

        it('201 with the created sale', async () => {
            const authUser = authenticateAs();
            mockedSalesService.create.mockResolvedValueOnce(defaultSale());

            const response = await request(server())
                .post('/api/sales')
                .set(AUTH_HEADER)
                .send(body)
                .expect(HttpStatus.CREATED);

            expect(response.body).toEqual(saleBody);
            expect(mockedSalesService.create).toHaveBeenCalledWith(authUser, body);
        });

        it('hands the service the user resolved from the token', async () => {
            const authUser = authenticateAs(otherUser());
            mockedSalesService.create.mockResolvedValueOnce(defaultSale());

            await request(server()).post('/api/sales').set(AUTH_HEADER).send(body).expect(HttpStatus.CREATED);

            expect(mockedSalesService.create).toHaveBeenCalledWith(authUser, body);
            expect(authUser.id).toBe(otherUser().id);
        });

        it('400 with a detail per missing field', async () => {
            authenticateAs();

            const response = await request(server())
                .post('/api/sales')
                .set(AUTH_HEADER)
                .send({})
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.code).toBe('VALIDATION_ERROR');
            expect(response.body.error.details).toEqual([
                { field: 'productId', message: 'Campo obrigatório.' },
                { field: 'quantity', message: 'Campo obrigatório.' },
                { field: 'date', message: 'Campo obrigatório.' },
            ]);
            expect(mockedSalesService.create).not.toHaveBeenCalled();
        });

        it.each([
            [{ productId: 'abc' }, 'productId', 'Deve ser um UUID válido.'],
            [{ quantity: 0 }, 'quantity', 'Deve ser maior que zero.'],
            [{ quantity: -1 }, 'quantity', 'Deve ser maior que zero.'],
            [{ quantity: 1.5 }, 'quantity', 'Deve ser um número inteiro.'],
            [{ quantity: '2' }, 'quantity', 'Deve ser um número inteiro.'],
            [{ quantity: 100_001 }, 'quantity', 'Deve ser menor ou igual a 100000.'],
            [{ date: '2026-02-30' }, 'date', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ date: '2026-10-24T12:00:00Z' }, 'date', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
        ])('400 VALIDATION_ERROR for %o', async (override, field, message) => {
            authenticateAs();

            const response = await request(server())
                .post('/api/sales')
                .set(AUTH_HEADER)
                .send({ ...body, ...override })
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.details).toEqual([{ field, message }]);
            expect(mockedSalesService.create).not.toHaveBeenCalled();
        });

        it.each(['price', 'unitPrice', 'unitCost', 'profit', 'productName', 'userId'])(
            'rejects a client-sent %s (name, price and cost come from the catalog; the profit is derived)',
            async (field) => {
                authenticateAs();

                const response = await request(server())
                    .post('/api/sales')
                    .set(AUTH_HEADER)
                    .send({ ...body, [field]: field === 'productName' ? 'Grátis' : 0.01 })
                    .expect(HttpStatus.BAD_REQUEST);

                expect(response.body.error.details).toEqual([{ field, message: 'Campo não permitido.' }]);
                expect(mockedSalesService.create).not.toHaveBeenCalled();
            },
        );

        it('404 PRODUCT_NOT_FOUND envelope', async () => {
            authenticateAs();
            mockedSalesService.create.mockRejectedValueOnce(new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND));

            const response = await request(server())
                .post('/api/sales')
                .set(AUTH_HEADER)
                .send(body)
                .expect(HttpStatus.NOT_FOUND);

            expect(response.body).toEqual({ error: { code: 'PRODUCT_NOT_FOUND', message: 'Produto não encontrado.' } });
        });
    });

    describe('PATCH /api/sales/:id', () => {
        it('200 with the updated sale', async () => {
            const authUser = authenticateAs();
            mockedSalesService.update.mockResolvedValueOnce(defaultSale({ quantity: 3 }));

            const response = await request(server())
                .patch(`/api/sales/${sale_id}`)
                .set(AUTH_HEADER)
                .send({ quantity: 3 })
                .expect(HttpStatus.OK);

            expect(response.body).toEqual({ ...saleBody, quantity: 3, total: 9, profit: 6 });
            expect(mockedSalesService.update).toHaveBeenCalledWith(authUser, sale_id, { quantity: 3 });
        });

        it('accepts every editable field together', async () => {
            const authUser = authenticateAs();
            mockedSalesService.update.mockResolvedValueOnce(defaultSale());
            const body = { productId: product_id, quantity: 4, date: '2026-10-23' };

            await request(server()).patch(`/api/sales/${sale_id}`).set(AUTH_HEADER).send(body).expect(HttpStatus.OK);

            expect(mockedSalesService.update).toHaveBeenCalledWith(authUser, sale_id, body);
        });

        it('400 for a malformed id, before reaching the service', async () => {
            authenticateAs();

            const response = await request(server())
                .patch('/api/sales/not-a-uuid')
                .set(AUTH_HEADER)
                .send({ quantity: 3 })
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body).toEqual({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Revise os campos enviados.',
                    details: [{ field: 'id', message: 'Deve ser um UUID válido.' }],
                },
            });
            expect(mockedSalesService.update).not.toHaveBeenCalled();
        });

        it.each([
            [{ productId: null }, 'productId', 'Deve ser um UUID válido.'],
            [{ productId: 'abc' }, 'productId', 'Deve ser um UUID válido.'],
            [{ quantity: null }, 'quantity', 'Deve ser um número inteiro.'],
            [{ quantity: 0 }, 'quantity', 'Deve ser maior que zero.'],
            [{ date: null }, 'date', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ date: '2026-13-01' }, 'date', 'Deve ser uma data válida no formato AAAA-MM-DD.'],
            [{ price: 1 }, 'price', 'Campo não permitido.'],
            [{ unitCost: 0.01 }, 'unitCost', 'Campo não permitido.'],
            [{ profit: 100 }, 'profit', 'Campo não permitido.'],
            [{ productName: 'Outro' }, 'productName', 'Campo não permitido.'],
            [{ userId: 'someone-else' }, 'userId', 'Campo não permitido.'],
        ])('400 VALIDATION_ERROR for %o', async (body, field, message) => {
            authenticateAs();

            const response = await request(server())
                .patch(`/api/sales/${sale_id}`)
                .set(AUTH_HEADER)
                .send(body)
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.details).toEqual([{ field, message }]);
            expect(mockedSalesService.update).not.toHaveBeenCalled();
        });

        it.each([
            [ERROR_CODE.SALE_NOT_FOUND, 'Venda não encontrada.'],
            [ERROR_CODE.PRODUCT_NOT_FOUND, 'Produto não encontrado.'],
        ])('404 %s envelope', async (code, message) => {
            authenticateAs();
            mockedSalesService.update.mockRejectedValueOnce(new NotFoundException(code));

            const response = await request(server())
                .patch(`/api/sales/${sale_id}`)
                .set(AUTH_HEADER)
                .send({ productId: product_id })
                .expect(HttpStatus.NOT_FOUND);

            expect(response.body).toEqual({ error: { code, message } });
        });
    });

    describe('DELETE /api/sales/:id', () => {
        it('204 with an empty body', async () => {
            const authUser = authenticateAs();
            mockedSalesService.remove.mockResolvedValueOnce(undefined);

            const response = await request(server())
                .delete(`/api/sales/${sale_id}`)
                .set(AUTH_HEADER)
                .expect(HttpStatus.NO_CONTENT);

            expect(response.body).toEqual({});
            expect(mockedSalesService.remove).toHaveBeenCalledWith(authUser, sale_id);
        });

        it("404 SALE_NOT_FOUND when deleting another user's sale (scoped by the token user)", async () => {
            const authUser = authenticateAs(otherUser());
            mockedSalesService.remove.mockRejectedValueOnce(new NotFoundException(ERROR_CODE.SALE_NOT_FOUND));

            const response = await request(server())
                .delete(`/api/sales/${sale_id}`)
                .set(AUTH_HEADER)
                .expect(HttpStatus.NOT_FOUND);

            expect(response.body).toEqual({ error: { code: 'SALE_NOT_FOUND', message: 'Venda não encontrada.' } });
            expect(mockedSalesService.remove).toHaveBeenCalledWith(authUser, sale_id);
        });

        it('400 for a malformed id', async () => {
            authenticateAs();

            const response = await request(server())
                .delete('/api/sales/123')
                .set(AUTH_HEADER)
                .expect(HttpStatus.BAD_REQUEST);

            expect(response.body.error.details).toEqual([{ field: 'id', message: 'Deve ser um UUID válido.' }]);
            expect(mockedSalesService.remove).not.toHaveBeenCalled();
        });
    });
});
