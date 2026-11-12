/**
 * What the user sold on one local calendar day (in the user's timezone). A derived read model,
 * not a table row; days without sales simply have no entry.
 */
export class DailySalesTotal {
    /** `YYYY-MM-DD` in the user's timezone. */
    day: string;
    /** Σ quantity × historical unit price. */
    revenue_cents: number;
    /** Σ quantity × unit cost snapshotted on each sale. */
    cost_cents: number;
    /** The part of `revenue_cents` that comes from sales recorded with cost 0 (cost not informed). */
    uncosted_revenue_cents: number;
    /** Units sold. */
    quantity: number;
    /** Sale records (one record is one product line). */
    sales_count: number;

    constructor(params: {
        day: string;
        revenue_cents: number;
        cost_cents: number;
        uncosted_revenue_cents: number;
        quantity: number;
        sales_count: number;
    }) {
        this.day = params.day;
        this.revenue_cents = params.revenue_cents;
        this.cost_cents = params.cost_cents;
        this.uncosted_revenue_cents = params.uncosted_revenue_cents;
        this.quantity = params.quantity;
        this.sales_count = params.sales_count;
    }
}
