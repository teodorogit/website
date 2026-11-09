/**
 * Read-only projections of the user's persisted data used to ground the assistant (BACKEND_SCOPE.md §2
 * "Assistente de conversação"). They mirror existing rows, so — unlike write entities — they never
 * generate ids or timestamps. Money is integer cents.
 */

export class CatalogProduct {
    id: string;
    name: string;
    price_cents: number;
    preparation_cost_cents: number;
    updated_at: Date;

    constructor(params: CatalogProduct) {
        this.id = params.id;
        this.name = params.name;
        this.price_cents = params.price_cents;
        this.preparation_cost_cents = params.preparation_cost_cents;
        this.updated_at = params.updated_at;
    }
}

export type SalesTotals = {
    sales_count: number;
    units: number;
    revenue_cents: number;
};

export const emptySalesTotals = (): SalesTotals => ({ sales_count: 0, units: 0, revenue_cents: 0 });

/**
 * Sales of one product. `product_id` is null for sales whose product was deleted; those are grouped by
 * the name snapshot saved on the sale (`removed_product_name`).
 */
export class ProductSalesSummary {
    product_id: string | null;
    removed_product_name: string | null;
    all_time: SalesTotals;
    last_30_days: SalesTotals;
    last_7_days: SalesTotals;
    today: SalesTotals;
    first_sale_at: Date;
    last_sale_at: Date;

    constructor(params: ProductSalesSummary) {
        this.product_id = params.product_id;
        this.removed_product_name = params.removed_product_name;
        this.all_time = params.all_time;
        this.last_30_days = params.last_30_days;
        this.last_7_days = params.last_7_days;
        this.today = params.today;
        this.first_sale_at = params.first_sale_at;
        this.last_sale_at = params.last_sale_at;
    }
}

export class RecentSale {
    product_name_snapshot: string;
    unit_price_cents: number;
    quantity: number;
    occurred_at: Date;

    constructor(params: RecentSale) {
        this.product_name_snapshot = params.product_name_snapshot;
        this.unit_price_cents = params.unit_price_cents;
        this.quantity = params.quantity;
        this.occurred_at = params.occurred_at;
    }
}

/** Half-open instant range `[start, end)`, built with `localDateRange` in the user's timezone. */
export type InstantRange = {
    start: Date;
    end: Date;
};

export type SalesWindows = {
    today: InstantRange;
    last_7_days: InstantRange;
    last_30_days: InstantRange;
};

export type ProductContext = {
    product: CatalogProduct;
    /** Null when the product has no sales. */
    sales: ProductSalesSummary | null;
};

/** Everything the assistant may know about the user's business for one question. */
export type ChatContext = {
    timezone: string;
    /** Calendar dates (`YYYY-MM-DD`) in `timezone`. */
    today: string;
    last_7_days_start: string;
    last_30_days_start: string;
    catalog_size: number;
    /** The whole catalog, or — for large catalogs — the products relevant to the question plus the best sellers. */
    products: ProductContext[];
    removed_product_sales: ProductSalesSummary[];
    removed_product_groups_omitted: number;
    totals: {
        all_time: SalesTotals;
        last_30_days: SalesTotals;
        last_7_days: SalesTotals;
        today: SalesTotals;
    };
    first_sale_at: Date | null;
    last_sale_at: Date | null;
    recent_sales: RecentSale[];
    sales_goal_cents: number | null;
};
