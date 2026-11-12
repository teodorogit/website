import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ERROR_CODE } from '@/common/errors/error-code';
import { UserScope } from '@/common/repository/repository';
import { reaisToCents } from '@/common/utils/money.util';
import { isUniqueConstraintError } from '@/infrastructure/prisma/prisma-errors';
import { AuthUser } from '@/modules/auth/auth-user';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { Product, ProductChanges } from './entities/product.entity';
import { PRODUCT_REPOSITORY, ProductRepository } from './repository/product.repository';

/**
 * Catalog size cap per user. Kept below the chat's shared embedding cache (PRODUCT_EMBEDDING_CACHE_SIZE),
 * so one user's catalog cannot evict every other user's product vectors, and bounds the per-request
 * context and embedding work of POST /api/chat.
 */
export const MAX_PRODUCTS_PER_USER = 500;

@Injectable()
export class ProductsService {
    constructor(
        @Inject(PRODUCT_REPOSITORY)
        private readonly productRepository: ProductRepository,
    ) {}

    findAll(user: AuthUser): Promise<Product[]> {
        return this.productRepository.findMany(scopeOf(user));
    }

    /** 404 PRODUCT_NOT_FOUND when missing or owned by another user (the two are indistinguishable). */
    async findOne(user: AuthUser, id: string): Promise<Product> {
        const product = await this.productRepository.findById(id, scopeOf(user));
        if (!product) {
            throw new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND);
        }

        return product;
    }

    async create(user: AuthUser, dto: CreateProductDto): Promise<Product> {
        const product = new Product({
            user_id: user.id,
            name: dto.name,
            price_cents: reaisToCents(dto.price),
            ...(dto.preparationCost !== undefined && { preparation_cost_cents: reaisToCents(dto.preparationCost) }),
        });

        const created = await this.withNameConflict(() =>
            this.productRepository.insert(product, scopeOf(user), MAX_PRODUCTS_PER_USER),
        );
        if (!created) {
            throw new ConflictException(ERROR_CODE.PRODUCT_LIMIT_REACHED);
        }

        return created;
    }

    /**
     * Past sales are not touched: they keep their own name/price/cost snapshot, so a new price or
     * preparation cost never reprices or re-costs them (BACKEND_SCOPE.md §2).
     * An empty body is a no-op that returns the product as is (and does not bump `updated_at`).
     */
    async update(user: AuthUser, id: string, dto: UpdateProductDto): Promise<Product> {
        const changes: ProductChanges = {
            ...(dto.name !== undefined && { name: dto.name }),
            ...(dto.price !== undefined && { price_cents: reaisToCents(dto.price) }),
            ...(dto.preparationCost !== undefined && { preparation_cost_cents: reaisToCents(dto.preparationCost) }),
        };

        if (Object.keys(changes).length === 0) {
            return this.findOne(user, id);
        }

        const updated = await this.withNameConflict(() => this.productRepository.update(id, changes, scopeOf(user)));
        if (!updated) {
            throw new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND);
        }

        return updated;
    }

    /** Sales of the product stay readable: the FK sets `sales.product_id` to NULL (BACKEND_SCOPE.md §3). */
    async remove(user: AuthUser, id: string): Promise<void> {
        const deleted = await this.productRepository.delete(id, scopeOf(user));
        if (!deleted) {
            throw new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND);
        }
    }

    /** The case-insensitive unique index on (user_id, name) is the source of truth, so concurrent writes also end in 409. */
    private async withNameConflict<T>(write: () => Promise<T>): Promise<T> {
        try {
            return await write();
        } catch (error) {
            if (isUniqueConstraintError(error)) {
                throw new ConflictException(ERROR_CODE.PRODUCT_NAME_CONFLICT);
            }

            throw error;
        }
    }
}

function scopeOf(user: AuthUser): UserScope {
    return { user_id: user.id };
}
