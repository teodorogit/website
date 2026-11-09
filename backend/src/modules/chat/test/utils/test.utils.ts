import { JestMock } from '@/common/types/types';
import { ChatService } from '../../chat.service';
import {
    CatalogProduct,
    ProductSalesSummary,
    RecentSale,
    SalesTotals,
    emptySalesTotals,
} from '../../entities/chat-context.entity';
import { ChatMessage } from '../../entities/chat-message.entity';
import { ChatContextRepository } from '../../repository/chat-context.repository';

export const product_id = '22222222-2222-4222-8222-222222222222';
export const other_product_id = '33333333-3333-4333-8333-333333333333';

export const mockedChatService: JestMock<ChatService> = {
    reply: jest.fn(),
};

export const mockedChatContextRepository: JestMock<ChatContextRepository> = {
    listProducts: jest.fn(),
    summarizeSalesByProduct: jest.fn(),
    listRecentSales: jest.fn(),
    findSalesGoalCents: jest.fn(),
};

export const defaultCatalogProduct = (overrides: Partial<CatalogProduct> = {}): CatalogProduct =>
    new CatalogProduct({
        id: product_id,
        name: 'Brigadeiro',
        price_cents: 300,
        preparation_cost_cents: 50,
        updated_at: new Date('2026-10-01T12:00:00.000Z'),
        ...overrides,
    });

export const salesTotals = (sales_count: number, units: number, revenue_cents: number): SalesTotals => ({
    sales_count,
    units,
    revenue_cents,
});

export const defaultProductSalesSummary = (overrides: Partial<ProductSalesSummary> = {}): ProductSalesSummary =>
    new ProductSalesSummary({
        product_id,
        removed_product_name: null,
        all_time: salesTotals(4, 10, 3000),
        last_30_days: salesTotals(2, 5, 1500),
        last_7_days: salesTotals(1, 2, 600),
        today: emptySalesTotals(),
        first_sale_at: new Date('2026-09-01T15:00:00.000Z'),
        last_sale_at: new Date('2026-11-03T15:30:00.000Z'),
        ...overrides,
    });

export const defaultRecentSale = (overrides: Partial<RecentSale> = {}): RecentSale =>
    new RecentSale({
        product_name_snapshot: 'Brigadeiro',
        unit_price_cents: 300,
        quantity: 2,
        occurred_at: new Date('2026-11-03T15:30:00.000Z'),
        ...overrides,
    });

export const defaultMessages = (): ChatMessage[] => [
    { role: 'assistant', content: 'Oi! Como posso ajudar?' },
    { role: 'user', content: 'Quais produtos vendem mais?' },
];
