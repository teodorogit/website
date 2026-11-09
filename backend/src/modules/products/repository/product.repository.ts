import { UserScope } from '@/common/repository/repository';
import { Product, ProductChanges } from '../entities/product.entity';

export const PRODUCT_REPOSITORY = 'ProductRepository';

/**
 * Every method is scoped to one user: a product owned by someone else behaves exactly
 * like a missing one (`null` / `false`), which the service turns into 404.
 */
export interface ProductRepository {
    /** All of the user's products, ordered by name (case-insensitive, the column is citext). */
    findMany(scope: UserScope): Promise<Product[]>;

    findById(id: string, scope: UserScope): Promise<Product | null>;

    /**
     * Inserts the product owned by `scope.user_id`, or returns `null` without inserting when the user
     * already owns `maxProducts` products (holds under concurrent inserts). Rejects with Prisma P2002 on a
     * duplicate name.
     */
    insert(product: Product, scope: UserScope, maxProducts: number): Promise<Product | null>;

    /** Applies `changes` and returns the updated product, or `null` when it is not the user's; P2002 on a duplicate name. */
    update(id: string, changes: ProductChanges, scope: UserScope): Promise<Product | null>;

    /** `false` when there was nothing of the user's to delete. Sales keep their snapshot (FK ON DELETE SET NULL). */
    delete(id: string, scope: UserScope): Promise<boolean>;
}
