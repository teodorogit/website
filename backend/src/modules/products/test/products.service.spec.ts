import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Prisma } from '@prisma/client';
import { ERROR_CODE } from '@/common/errors/error-code';
import { defaultAuthUser } from '@/modules/auth/test/utils/test.utils';
import { other_user_id, otherUser, user_id } from '@/modules/users/test/utils/test.utils';
import { Product } from '../entities/product.entity';
import { MAX_PRODUCTS_PER_USER, ProductsService } from '../products.service';
import { PRODUCT_REPOSITORY } from '../repository/product.repository';
import { defaultProduct, mockedProductRepository, product_id } from './utils/test.utils';

const uniqueViolation = () =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'test' });

describe('ProductsService', () => {
    let service: ProductsService;
    const user = defaultAuthUser();
    const scope = { user_id };

    beforeEach(async () => {
        jest.resetAllMocks();

        const moduleRef = await Test.createTestingModule({
            providers: [{ provide: PRODUCT_REPOSITORY, useValue: mockedProductRepository }, ProductsService],
        }).compile();

        service = moduleRef.get(ProductsService);
    });

    describe('findAll', () => {
        it("returns the repository's products scoped to the authenticated user", async () => {
            const products = [defaultProduct()];
            mockedProductRepository.findMany.mockResolvedValueOnce(products);

            await expect(service.findAll(user)).resolves.toBe(products);
            expect(mockedProductRepository.findMany).toHaveBeenCalledWith(scope);
        });

        it("scopes another user's request to that user's id", async () => {
            mockedProductRepository.findMany.mockResolvedValueOnce([]);

            await service.findAll(defaultAuthUser(otherUser()));

            expect(mockedProductRepository.findMany).toHaveBeenCalledWith({ user_id: other_user_id });
        });
    });

    describe('findOne', () => {
        it('returns the product', async () => {
            const product = defaultProduct();
            mockedProductRepository.findById.mockResolvedValueOnce(product);

            await expect(service.findOne(user, product_id)).resolves.toBe(product);
            expect(mockedProductRepository.findById).toHaveBeenCalledWith(product_id, scope);
        });

        it('404 PRODUCT_NOT_FOUND when missing or not owned', async () => {
            mockedProductRepository.findById.mockResolvedValueOnce(null);

            await expect(service.findOne(user, product_id)).rejects.toEqual(
                new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND),
            );
        });
    });

    describe('create', () => {
        it('converts reais to cents and owns the product by the authenticated user', async () => {
            mockedProductRepository.insert.mockImplementationOnce(async (product: Product) => product);

            const created = await service.create(user, { name: 'Brownie', price: 8.5, preparationCost: 2.29 });

            expect(created).toBeInstanceOf(Product);
            expect(created).toMatchObject({
                user_id,
                name: 'Brownie',
                price_cents: 850,
                preparation_cost_cents: 229,
            });
            expect(mockedProductRepository.insert).toHaveBeenCalledWith(created, scope, MAX_PRODUCTS_PER_USER);
        });

        it('defaults the preparation cost to zero', async () => {
            mockedProductRepository.insert.mockImplementationOnce(async (product: Product) => product);

            const created = await service.create(user, { name: 'Brownie', price: 8 });

            expect(created.preparation_cost_cents).toBe(0);
        });

        it('409 PRODUCT_NAME_CONFLICT when the name already exists for the user (case-insensitive index)', async () => {
            mockedProductRepository.insert.mockRejectedValueOnce(uniqueViolation());

            await expect(service.create(user, { name: 'brigadeiro', price: 3 })).rejects.toEqual(
                new ConflictException(ERROR_CODE.PRODUCT_NAME_CONFLICT),
            );
        });

        it('409 PRODUCT_LIMIT_REACHED when the user already owns the maximum number of products', async () => {
            mockedProductRepository.insert.mockResolvedValueOnce(null);

            await expect(service.create(user, { name: 'Brownie', price: 8 })).rejects.toEqual(
                new ConflictException(ERROR_CODE.PRODUCT_LIMIT_REACHED),
            );
        });

        it('propagates other failures untouched', async () => {
            const failure = new Error('connection lost');
            mockedProductRepository.insert.mockRejectedValueOnce(failure);

            await expect(service.create(user, { name: 'Brownie', price: 8 })).rejects.toBe(failure);
        });
    });

    describe('update', () => {
        it('sends only the provided fields, in cents', async () => {
            const updated = defaultProduct({ price_cents: 1099 });
            mockedProductRepository.update.mockResolvedValueOnce(updated);

            await expect(service.update(user, product_id, { price: 10.99 })).resolves.toBe(updated);
            expect(mockedProductRepository.update).toHaveBeenCalledWith(product_id, { price_cents: 1099 }, scope);
        });

        it('maps every field', async () => {
            mockedProductRepository.update.mockResolvedValueOnce(defaultProduct());

            await service.update(user, product_id, { name: 'Bombom', price: 4, preparationCost: 0 });

            expect(mockedProductRepository.update).toHaveBeenCalledWith(
                product_id,
                { name: 'Bombom', price_cents: 400, preparation_cost_cents: 0 },
                scope,
            );
        });

        it('an empty body is a no-op that returns the current product without writing', async () => {
            const product = defaultProduct();
            mockedProductRepository.findById.mockResolvedValueOnce(product);

            await expect(service.update(user, product_id, {})).resolves.toBe(product);
            expect(mockedProductRepository.update).not.toHaveBeenCalled();
            expect(mockedProductRepository.findById).toHaveBeenCalledWith(product_id, scope);
        });

        it('an empty body on a missing product is still 404', async () => {
            mockedProductRepository.findById.mockResolvedValueOnce(null);

            await expect(service.update(user, product_id, {})).rejects.toEqual(
                new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND),
            );
        });

        it("404 PRODUCT_NOT_FOUND when the product is missing or another user's", async () => {
            mockedProductRepository.update.mockResolvedValueOnce(null);

            await expect(service.update(user, product_id, { name: 'Bombom' })).rejects.toEqual(
                new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND),
            );
        });

        it('409 PRODUCT_NAME_CONFLICT when renaming onto an existing name', async () => {
            mockedProductRepository.update.mockRejectedValueOnce(uniqueViolation());

            await expect(service.update(user, product_id, { name: 'BROWNIE' })).rejects.toEqual(
                new ConflictException(ERROR_CODE.PRODUCT_NAME_CONFLICT),
            );
        });
    });

    describe('remove', () => {
        it('deletes the user-scoped product', async () => {
            mockedProductRepository.delete.mockResolvedValueOnce(true);

            await expect(service.remove(user, product_id)).resolves.toBeUndefined();
            expect(mockedProductRepository.delete).toHaveBeenCalledWith(product_id, scope);
        });

        it("404 PRODUCT_NOT_FOUND when nothing of the user's was deleted", async () => {
            mockedProductRepository.delete.mockResolvedValueOnce(false);

            await expect(service.remove(user, product_id)).rejects.toEqual(
                new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND),
            );
        });
    });
});
