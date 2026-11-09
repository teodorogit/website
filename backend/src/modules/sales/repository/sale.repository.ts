import { UserScope } from '@/common/repository/repository';
import { Sale } from '../entities/sale.entity';

export const SALE_REPOSITORY = 'SaleRepository';

/** The catalog fields a sale snapshots. */
export type ProductSnapshot = {
    id: string;
    name: string;
    price_cents: number;
};

/** Keyset position in the `(occurred_at DESC, id DESC)` listing order. */
export type SaleKeyset = Pick<Sale, 'occurred_at' | 'id'>;

export type SaleListQuery = {
    /** Inclusive lower bound on `occurred_at`. */
    occurred_from?: Date;
    /** Exclusive upper bound on `occurred_at`. */
    occurred_before?: Date;
    /** Return only rows strictly after this position. */
    after?: SaleKeyset;
    /** Max rows; omitted = every matching row. */
    take?: number;
};

/** Columns an edit may change. Only the keys present are written. */
export type SaleChanges = Partial<
    Pick<Sale, 'product_id' | 'product_name_snapshot' | 'unit_price_cents' | 'quantity' | 'occurred_at'>
>;

export interface SaleRepository {
    /**
     * Runs `work` in one database transaction; the repository it receives is bound to it.
     * Calling it on an already transaction-bound repository joins the open transaction.
     */
    transaction<T>(work: (repository: SaleRepository) => Promise<T>): Promise<T>;

    /** Ordered by `occurred_at DESC, id DESC`. */
    findMany(scope: UserScope, query: SaleListQuery): Promise<Sale[]>;

    findById(scope: UserScope, id: string): Promise<Sale | null>;

    /**
     * Reads the user's product and holds a share lock on it until the surrounding transaction
     * ends, so it can't be deleted or repriced before the snapshot commits. Only meaningful
     * inside `transaction`.
     */
    lockProductForSnapshot(scope: UserScope, productId: string): Promise<ProductSnapshot | null>;

    /** Always persists under `scope.user_id`, whatever `sale.user_id` says. */
    insert(scope: UserScope, sale: Sale): Promise<Sale>;

    /** Null when the sale does not exist for this user. */
    update(scope: UserScope, id: string, changes: SaleChanges): Promise<Sale | null>;

    /** False when the sale does not exist for this user. */
    delete(scope: UserScope, id: string): Promise<boolean>;
}
