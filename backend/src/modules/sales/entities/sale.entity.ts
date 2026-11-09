import crypto from 'node:crypto';
import { EntityProps } from '@/common/types/types';

/**
 * A recorded sale. `product_name_snapshot` and `unit_price_cents` are copied from the catalog
 * when the sale is created (or its product is swapped) and never follow later product edits;
 * `product_id` becomes null when the product is deleted (BACKEND_SCOPE.md §3).
 */
export class Sale {
    id: string;
    user_id: string;
    product_id: string | null;
    product_name_snapshot: string;
    unit_price_cents: number;
    quantity: number;
    occurred_at: Date;
    created_at: Date;
    updated_at: Date;

    constructor(params: EntityProps<Sale>) {
        this.id = params.id ?? crypto.randomUUID();
        this.user_id = params.user_id;
        this.product_id = params.product_id ?? null;
        this.product_name_snapshot = params.product_name_snapshot;
        this.unit_price_cents = params.unit_price_cents;
        this.quantity = params.quantity;
        this.occurred_at = params.occurred_at;
        this.created_at = params.created_at ?? new Date();
        this.updated_at = params.updated_at ?? new Date();
    }
}
