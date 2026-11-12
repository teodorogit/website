/**
 * One row of the best-seller ranking. A product is identified by its resolved name, compared
 * case-insensitively: the current catalog name while the sale still points to a product, otherwise
 * the name snapshot stored on the sale. So a rename keeps one row, a product deleted and re-created
 * under the same name is one row, and a deleted product appears once per name it was sold under.
 */
export class ProductSalesTotal {
    /** The catalog product behind the row; null when it no longer exists. */
    product_id: string | null;
    /** Current catalog name, or the most recent snapshot spelling when `product_id` is null. */
    product_name: string;
    /** Units sold. */
    quantity: number;
    revenue_cents: number;

    constructor(params: { product_id: string | null; product_name: string; quantity: number; revenue_cents: number }) {
        this.product_id = params.product_id;
        this.product_name = params.product_name;
        this.quantity = params.quantity;
        this.revenue_cents = params.revenue_cents;
    }
}
