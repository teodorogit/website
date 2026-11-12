import { Injectable } from '@nestjs/common';
import { Mapper } from '@/common/mapper/mapper';
import { aggregateToCents } from '@/common/utils/money.util';
import { DailySalesTotal } from '../entities/daily-sales-total.entity';
import { ProductSalesTotal } from '../entities/product-sales-total.entity';
import { WeeklySalesTotal } from '../entities/weekly-sales-total.entity';

export const DASHBOARD_MAPPER = 'DashboardMapper';

/** Row of the weekly aggregate query: the local Monday as text and `SUM(...)::bigint`. */
export type WeeklySalesRow = {
    week_start: string;
    total_cents: bigint;
};

/** Row of the daily aggregate query: the local day as text, every aggregate as bigint. */
export type DailySalesRow = {
    day: string;
    revenue_cents: bigint;
    cost_cents: bigint;
    uncosted_revenue_cents: bigint;
    quantity: bigint;
    sales_count: bigint;
};

/** Row of the best-seller query. `product_id` is null when no catalog product is behind the row. */
export type ProductSalesRow = {
    product_id: string | null;
    product_name: string;
    quantity: bigint;
    revenue_cents: bigint;
};

/** Same safe-integer conversion as money, for aggregates that count units or rows. */
const aggregateToCount = aggregateToCents;

@Injectable()
export class DashboardPrismaMapper implements Mapper<WeeklySalesRow, WeeklySalesTotal> {
    mapFromEntity(week: WeeklySalesTotal): WeeklySalesRow {
        return { week_start: week.week_start, total_cents: BigInt(week.total_cents) };
    }

    mapToEntity(row: WeeklySalesRow): WeeklySalesTotal {
        return new WeeklySalesTotal({ week_start: row.week_start, total_cents: aggregateToCents(row.total_cents) });
    }

    mapDailySalesToEntity(row: DailySalesRow): DailySalesTotal {
        return new DailySalesTotal({
            day: row.day,
            revenue_cents: aggregateToCents(row.revenue_cents),
            cost_cents: aggregateToCents(row.cost_cents),
            uncosted_revenue_cents: aggregateToCents(row.uncosted_revenue_cents),
            quantity: aggregateToCount(row.quantity),
            sales_count: aggregateToCount(row.sales_count),
        });
    }

    mapProductSalesToEntity(row: ProductSalesRow): ProductSalesTotal {
        return new ProductSalesTotal({
            product_id: row.product_id,
            product_name: row.product_name,
            quantity: aggregateToCount(row.quantity),
            revenue_cents: aggregateToCents(row.revenue_cents),
        });
    }
}
