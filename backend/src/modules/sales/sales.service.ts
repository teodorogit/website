import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ERROR_CODE } from '@/common/errors/error-code';
import { CursorPage, DEFAULT_PAGE_LIMIT, decodeCursor, encodeCursor } from '@/common/pagination/cursor-page';
import { UserScope } from '@/common/repository/repository';
import {
    addDays,
    compareCalendarDates,
    localDateRange,
    localDateTimeToInstant,
    startOfLocalDay,
    toLocalTimeOfDay,
} from '@/common/utils/date.util';
import { AuthUser } from '@/modules/auth/auth-user';
import { CreateSaleDto } from './dto/create-sale.dto';
import { ListSalesQuery } from './dto/list-sales-query.dto';
import { UpdateSaleDto } from './dto/update-sale.dto';
import { Sale } from './entities/sale.entity';
import {
    ProductSnapshot,
    SALE_REPOSITORY,
    SaleChanges,
    SaleKeyset,
    SaleListQuery,
    SaleRepository,
} from './repository/sale.repository';

const CURSOR_KEYS = ['occurredAt', 'id'] as const;

type OccurredAtRange = Pick<SaleListQuery, 'occurred_from' | 'occurred_before'>;

@Injectable()
export class SalesService {
    constructor(
        @Inject(SALE_REPOSITORY)
        private readonly saleRepository: SaleRepository,
    ) {}

    async list(user: AuthUser, query: ListSalesQuery): Promise<CursorPage<Sale>> {
        const range = resolveRange(query, user.timezone);
        const after = query.cursor === undefined ? undefined : decodeSaleCursor(query.cursor);

        // "Sem filtros, retornar todas as vendas paginadas" (BACKEND_SCOPE.md §2): only the unfiltered
        // history is paginated by default. A date/range filter returns every matching sale, because the
        // Home day/week views total them; the client can still opt in with `limit`/`cursor`.
        const isFiltered = query.date !== undefined || query.startDate !== undefined || query.endDate !== undefined;
        const paginate = !isFiltered || query.limit !== undefined || query.cursor !== undefined;

        if (!paginate) {
            return { items: await this.saleRepository.findMany(scopeOf(user), range), nextCursor: null };
        }

        const limit = query.limit ?? DEFAULT_PAGE_LIMIT;

        // One extra row tells whether another page exists without a COUNT.
        const rows = await this.saleRepository.findMany(scopeOf(user), {
            ...range,
            ...(after && { after }),
            take: limit + 1,
        });

        const items = rows.slice(0, limit);
        const last = items[items.length - 1];

        return {
            items,
            nextCursor: rows.length > limit && last ? encodeSaleCursor(last) : null,
        };
    }

    async create(user: AuthUser, dto: CreateSaleDto): Promise<Sale> {
        const scope = scopeOf(user);
        // The frontend stamps new sales with the current wall-clock time on the chosen day.
        const occurred_at = localDateTimeToInstant(
            dto.date,
            toLocalTimeOfDay(new Date(), user.timezone),
            user.timezone,
        );

        return this.saleRepository.transaction(async (repository) => {
            const product = await lockOwnedProduct(repository, scope, dto.productId);

            return repository.insert(
                scope,
                new Sale({
                    user_id: user.id,
                    product_id: product.id,
                    product_name_snapshot: product.name,
                    unit_price_cents: product.price_cents,
                    quantity: dto.quantity,
                    occurred_at,
                }),
            );
        });
    }

    async update(user: AuthUser, id: string, dto: UpdateSaleDto): Promise<Sale> {
        const scope = scopeOf(user);

        return this.saleRepository.transaction(async (repository) => {
            const sale = await repository.findById(scope, id);
            if (!sale) {
                throw new NotFoundException(ERROR_CODE.SALE_NOT_FOUND);
            }

            const changes: SaleChanges = {};

            // Re-snapshot only on an actual product swap: re-sending the same productId must not
            // silently reprice history, and a sale whose product was deleted keeps its snapshot.
            // Product columns are left out otherwise, so a concurrent product delete (which sets
            // product_id to NULL) is never overwritten with a dangling id. UUIDs compare
            // case-insensitively: @IsUUID accepts uppercase while Postgres returns lowercase.
            if (dto.productId !== undefined && dto.productId.toLowerCase() !== sale.product_id?.toLowerCase()) {
                const product = await lockOwnedProduct(repository, scope, dto.productId);
                changes.product_id = product.id;
                changes.product_name_snapshot = product.name;
                changes.unit_price_cents = product.price_cents;
            }

            if (dto.quantity !== undefined) {
                changes.quantity = dto.quantity;
            }

            if (dto.date !== undefined) {
                // Moving a sale to another day keeps its local time of day.
                changes.occurred_at = localDateTimeToInstant(
                    dto.date,
                    toLocalTimeOfDay(sale.occurred_at, user.timezone),
                    user.timezone,
                );
            }

            const updated = await repository.update(scope, id, changes);
            if (!updated) {
                throw new NotFoundException(ERROR_CODE.SALE_NOT_FOUND);
            }

            return updated;
        });
    }

    async remove(user: AuthUser, id: string): Promise<void> {
        const deleted = await this.saleRepository.delete(scopeOf(user), id);
        if (!deleted) {
            throw new NotFoundException(ERROR_CODE.SALE_NOT_FOUND);
        }
    }
}

function scopeOf(user: AuthUser): UserScope {
    return { user_id: user.id };
}

/** Missing and foreign products are indistinguishable (BACKEND_SCOPE.md §4). */
async function lockOwnedProduct(
    repository: SaleRepository,
    scope: UserScope,
    productId: string,
): Promise<ProductSnapshot> {
    const product = await repository.lockProductForSnapshot(scope, productId);
    if (!product) {
        throw new NotFoundException(ERROR_CODE.PRODUCT_NOT_FOUND);
    }

    return product;
}

/** Calendar filters → half-open instant range `[from, before)` in the user's timezone. */
function resolveRange(query: ListSalesQuery, timeZone: string): OccurredAtRange {
    const { date, startDate, endDate } = query;

    if (date !== undefined) {
        if (startDate !== undefined || endDate !== undefined) {
            throw new BadRequestException(ERROR_CODE.SALE_FILTER_CONFLICT);
        }

        const { start, end } = localDateRange(date, date, timeZone);
        return { occurred_from: start, occurred_before: end };
    }

    if (startDate !== undefined && endDate !== undefined && compareCalendarDates(startDate, endDate) > 0) {
        throw new BadRequestException(ERROR_CODE.INVALID_DATE_RANGE);
    }

    return {
        ...(startDate !== undefined && { occurred_from: startOfLocalDay(startDate, timeZone) }),
        ...(endDate !== undefined && { occurred_before: startOfLocalDay(addDays(endDate, 1), timeZone) }),
    };
}

function encodeSaleCursor(sale: Sale): string {
    return encodeCursor({ occurredAt: sale.occurred_at.toISOString(), id: sale.id });
}

/** Rejects well-formed cursors whose values could not have come from `encodeSaleCursor`. */
function decodeSaleCursor(cursor: string): SaleKeyset {
    const { occurredAt, id } = decodeCursor(cursor, CURSOR_KEYS);
    const occurred_at = new Date(occurredAt);

    if (Number.isNaN(occurred_at.getTime()) || occurred_at.toISOString() !== occurredAt || !isUUID(id)) {
        throw new BadRequestException(ERROR_CODE.INVALID_CURSOR);
    }

    return { occurred_at, id };
}
