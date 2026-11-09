import crypto from 'node:crypto';
import { EntityProps } from '@/common/types/types';

/** A catalog item of one user (BACKEND_SCOPE.md §3 `products`). Money is integer cents. */
export class Product {
    id: string;
    user_id: string;
    /** Unique per user, case-insensitively (citext + unique (user_id, name)). */
    name: string;
    price_cents: number;
    preparation_cost_cents: number;
    created_at: Date;
    updated_at: Date;

    constructor(params: Omit<EntityProps<Product>, 'preparation_cost_cents'> & { preparation_cost_cents?: number }) {
        this.id = params.id ?? crypto.randomUUID();
        this.user_id = params.user_id;
        this.name = params.name;
        this.price_cents = params.price_cents;
        // Mirrors the column default: the cost is optional on creation.
        this.preparation_cost_cents = params.preparation_cost_cents ?? 0;
        this.created_at = params.created_at ?? new Date();
        this.updated_at = params.updated_at ?? new Date();
    }
}

/** Fields a PATCH may change. Absent keys are left untouched. */
export type ProductChanges = Partial<Pick<Product, 'name' | 'price_cents' | 'preparation_cost_cents'>>;
