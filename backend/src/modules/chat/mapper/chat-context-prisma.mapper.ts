import { Injectable } from '@nestjs/common';
import { Product as ProductPrisma, Sale as SalePrisma } from '@prisma/client';
import { aggregateToCents } from '@/common/utils/money.util';
import { CatalogProduct, ProductSalesSummary, RecentSale, SalesTotals } from '../entities/chat-context.entity';

export const CHAT_CONTEXT_MAPPER = 'ChatContextMapper';

export type CatalogProductRow = Pick<
    ProductPrisma,
    'id' | 'name' | 'price_cents' | 'preparation_cost_cents' | 'updated_at'
>;

export type RecentSaleRow = Pick<SalePrisma, 'product_name_snapshot' | 'unit_price_cents' | 'quantity' | 'occurred_at'>;

/** SQL aggregates come back as bigint (COUNT, SUM(int)) or Decimal (SUM(bigint)); FILTERed sums are NULL when empty. */
type Aggregate = bigint | number | { toString(): string } | null;

/** Row of the `$queryRaw` in `ChatContextPrismaRepository.summarizeSalesByProduct`. */
export type ProductSalesSummaryRow = {
    product_id: string | null;
    removed_product_name: string | null;
    sales_count: Aggregate;
    units: Aggregate;
    revenue_cents: Aggregate;
    sales_count_30d: Aggregate;
    units_30d: Aggregate;
    revenue_cents_30d: Aggregate;
    sales_count_7d: Aggregate;
    units_7d: Aggregate;
    revenue_cents_7d: Aggregate;
    sales_count_today: Aggregate;
    units_today: Aggregate;
    revenue_cents_today: Aggregate;
    first_sale_at: Date;
    last_sale_at: Date;
};

/** Read-only mapper: the chat module only reads other modules' tables, so there is no entity → row direction. */
@Injectable()
export class ChatContextPrismaMapper {
    mapProductToEntity(row: CatalogProductRow): CatalogProduct {
        return new CatalogProduct({
            id: row.id,
            name: row.name,
            price_cents: row.price_cents,
            preparation_cost_cents: row.preparation_cost_cents,
            updated_at: row.updated_at,
        });
    }

    mapSalesSummaryToEntity(row: ProductSalesSummaryRow): ProductSalesSummary {
        const totals = (salesCount: Aggregate, units: Aggregate, revenueCents: Aggregate): SalesTotals => ({
            sales_count: aggregateToCents(salesCount),
            units: aggregateToCents(units),
            revenue_cents: aggregateToCents(revenueCents),
        });

        return new ProductSalesSummary({
            product_id: row.product_id,
            removed_product_name: row.removed_product_name,
            all_time: totals(row.sales_count, row.units, row.revenue_cents),
            last_30_days: totals(row.sales_count_30d, row.units_30d, row.revenue_cents_30d),
            last_7_days: totals(row.sales_count_7d, row.units_7d, row.revenue_cents_7d),
            today: totals(row.sales_count_today, row.units_today, row.revenue_cents_today),
            first_sale_at: row.first_sale_at,
            last_sale_at: row.last_sale_at,
        });
    }

    mapRecentSaleToEntity(row: RecentSaleRow): RecentSale {
        return new RecentSale({
            product_name_snapshot: row.product_name_snapshot,
            unit_price_cents: row.unit_price_cents,
            quantity: row.quantity,
            occurred_at: row.occurred_at,
        });
    }
}
