import { UserScope } from '@/common/repository/repository';
import { CatalogProduct, ProductSalesSummary, RecentSale, SalesWindows } from '../entities/chat-context.entity';

export const CHAT_CONTEXT_REPOSITORY = 'ChatContextRepository';

/** Read-only access to the authenticated user's own data for the assistant. Every query is scoped by `user_id`. */
export interface ChatContextRepository {
    /** The user's catalog, ordered by name. */
    listProducts(scope: UserScope): Promise<CatalogProduct[]>;

    /**
     * Per-product sales totals for all time and for each window. Totals use the historical unit price
     * saved on the sale (`unit_price_cents × quantity`), never the current catalog price.
     */
    summarizeSalesByProduct(scope: UserScope, windows: SalesWindows): Promise<ProductSalesSummary[]>;

    /** Most recent sales first. */
    listRecentSales(scope: UserScope, limit: number): Promise<RecentSale[]>;

    /** The user's sales goal in cents, or null when none is set. */
    findSalesGoalCents(scope: UserScope): Promise<number | null>;
}
