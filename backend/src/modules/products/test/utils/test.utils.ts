import { JestMock } from '@/common/types/types';
import { user_id } from '@/modules/users/test/utils/test.utils';
import { Product } from '../../entities/product.entity';
import { ProductsService } from '../../products.service';
import { ProductRepository } from '../../repository/product.repository';

export const product_id = '22222222-2222-4222-8222-222222222222';

export const mockedProductsService: JestMock<ProductsService> = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
};

export const mockedProductRepository: JestMock<ProductRepository> = {
    findMany: jest.fn(),
    findById: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};

export const defaultProduct = (overrides: Partial<Product> = {}): Product =>
    new Product({
        id: product_id,
        user_id,
        name: 'Brigadeiro',
        price_cents: 300,
        preparation_cost_cents: 0,
        created_at: new Date('2026-10-24T12:00:00.000Z'),
        updated_at: new Date('2026-10-24T12:00:00.000Z'),
        ...overrides,
    });
