import { ProductSalesTotal } from './product-sales-total.entity';

/** Revenue, cost and profit of a set of sales. `profit_cents` may be negative. */
export type ProfitTotals = {
    revenue_cents: number;
    cost_cents: number;
    profit_cents: number;
    /** Revenue of sales recorded with cost 0: it has no cost behind it, so it inflates the profit. */
    uncosted_revenue_cents: number;
};

export type PeriodTotals = ProfitTotals & {
    /** Units sold. */
    quantity: number;
    /** Sale records (one record is one product line). */
    sales_count: number;
    /** Distinct local calendar days with at least one sale. */
    selling_days: number;
};

export type WeekdaySales = {
    /** 1 = Monday … 7 = Sunday. */
    iso_weekday: number;
    revenue_cents: number;
    quantity: number;
    sales_count: number;
    /** Dates with this weekday between the period's first and last selling day, both inclusive. */
    occurrences: number;
    /** `revenue_cents / occurrences`, rounded; null when `occurrences` is 0. */
    average_revenue_cents: number | null;
};

export type WeekOfMonthSales = {
    /** 1–5: day-of-month blocks 1–7, 8–14, 15–21, 22–28 and 29–31. */
    week_of_month: number;
    start_day: number;
    end_day: number;
    revenue_cents: number;
    quantity: number;
    sales_count: number;
    /** Months of the period with at least one sale in this block. */
    months: number;
    /** `revenue_cents / months`, rounded; null when `months` is 0. */
    average_revenue_cents: number | null;
};

export type MonthlyProfit = ProfitTotals & {
    /** 1–12. */
    month: number;
};

type DashboardMetricsProps = {
    [K in keyof DashboardMetrics]: DashboardMetrics[K];
};

/**
 * The sales metrics of one year, recomputed from persisted sales on every request.
 * "The period" is the whole year or, when `month` is set, that month; the profit series always
 * covers the whole year.
 */
export class DashboardMetrics {
    year: number;
    /** 1–12, or null when the period is the whole year. */
    month: number | null;
    /** First and last calendar date of the period, both inclusive. */
    period_start: string;
    period_end: string;
    /** Local date of the oldest sale the user ever recorded (not limited to the period); null without sales. */
    first_sale_date: string | null;
    totals: PeriodTotals;
    /** Revenue per day with sales; null when the period has no sales. */
    average_per_selling_day_cents: number | null;
    /** Revenue per sale record; null when the period has no sales. */
    average_per_sale_cents: number | null;
    /** Best sellers of the period by units, at most `TOP_PRODUCTS_LIMIT`. */
    top_products: ProductSalesTotal[];
    /** Always 7 entries, Monday first. */
    sales_by_weekday: WeekdaySales[];
    best_weekday: WeekdaySales | null;
    /** Always 5 entries. */
    sales_by_week_of_month: WeekOfMonthSales[];
    best_week_of_month: WeekOfMonthSales | null;
    /** Always 12 entries, January first, whatever the period. */
    monthly_profit: MonthlyProfit[];
    annual_profit: ProfitTotals;

    constructor(params: DashboardMetricsProps) {
        this.year = params.year;
        this.month = params.month;
        this.period_start = params.period_start;
        this.period_end = params.period_end;
        this.first_sale_date = params.first_sale_date;
        this.totals = params.totals;
        this.average_per_selling_day_cents = params.average_per_selling_day_cents;
        this.average_per_sale_cents = params.average_per_sale_cents;
        this.top_products = params.top_products;
        this.sales_by_weekday = params.sales_by_weekday;
        this.best_weekday = params.best_weekday;
        this.sales_by_week_of_month = params.sales_by_week_of_month;
        this.best_week_of_month = params.best_week_of_month;
        this.monthly_profit = params.monthly_profit;
        this.annual_profit = params.annual_profit;
    }
}
