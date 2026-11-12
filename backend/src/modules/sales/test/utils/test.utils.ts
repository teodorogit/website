import { JestMock } from '@/common/types/types';
import { other_user_id, user_id } from '@/modules/users/test/utils/test.utils';
import { Sale } from '../../entities/sale.entity';
import { ProductSnapshot, SaleRepository } from '../../repository/sale.repository';
import { SalesService } from '../../sales.service';

export { other_user_id, user_id };

export const sale_id = '22222222-2222-4222-8222-222222222222';
export const product_id = '33333333-3333-4333-8333-333333333333';
export const other_product_id = '44444444-4444-4444-8444-444444444444';

export const mockedSalesService: JestMock<SalesService> = {
    list: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
};

export const mockedSaleRepository: JestMock<SaleRepository> = {
    transaction: jest.fn(),
    findMany: jest.fn(),
    findById: jest.fn(),
    lockProductForSnapshot: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};

/** What `transaction` hands to its callback, kept apart so specs can prove writes ran inside it. */
export const mockedTransactionalSaleRepository: JestMock<SaleRepository> = {
    transaction: jest.fn(),
    findMany: jest.fn(),
    findById: jest.fn(),
    lockProductForSnapshot: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
};

/** 2026-10-24 12:30 in America/Sao_Paulo (UTC-3); 2026-10-25 00:30 in the test runner's Asia/Tokyo. */
export const default_occurred_at = new Date('2026-10-24T15:30:00.000Z');

export const defaultSale = (overrides: Partial<Sale> = {}): Sale =>
    new Sale({
        id: sale_id,
        user_id,
        product_id,
        product_name_snapshot: 'Brigadeiro',
        unit_price_cents: 300,
        unit_cost_cents: 100,
        quantity: 2,
        occurred_at: default_occurred_at,
        created_at: new Date('2026-10-24T15:30:00.000Z'),
        updated_at: new Date('2026-10-24T15:30:00.000Z'),
        ...overrides,
    });

export const defaultProductSnapshot = (overrides: Partial<ProductSnapshot> = {}): ProductSnapshot => ({
    id: product_id,
    name: 'Brigadeiro',
    price_cents: 300,
    preparation_cost_cents: 100,
    ...overrides,
});
