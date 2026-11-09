import { Inject, Injectable } from '@nestjs/common';
import { RequestAbortedError } from '@/common/errors/request-aborted.error';
import { UserScope } from '@/common/repository/repository';
import { addDays, localDateRange, todayIn } from '@/common/utils/date.util';
import { OLLAMA_GATEWAY, OllamaChatMessage, OllamaGateway } from '@/infrastructure/ollama/ollama-gateway.interface';
import { AuthUser } from '../auth/auth-user';
import {
    CatalogProduct,
    ChatContext,
    ProductContext,
    ProductSalesSummary,
    SalesTotals,
    SalesWindows,
    emptySalesTotals,
} from './entities/chat-context.entity';
import { CHAT_MAX_CONTENT_LENGTH } from './dto/chat-request.dto';
import { CHAT_ROLE, ChatMessage } from './entities/chat-message.entity';
import { ChatConcurrencyLimiter } from './limiter/chat-concurrency-limiter';
import { buildSystemPrompt, formatChatContext } from './prompt/chat-prompt';
import { CHAT_CONTEXT_REPOSITORY, ChatContextRepository } from './repository/chat-context.repository';
import { ProductRetriever } from './retrieval/product-retriever';
import { truncateReply } from './utils/truncate-reply';

/** Up to this many products, the whole catalog goes into the context and no embedding call is made. */
export const FULL_CATALOG_THRESHOLD = 15;
/** Larger catalogs: products most similar to the question… */
export const RELEVANT_PRODUCTS_LIMIT = 8;
/** …plus the best sellers, so "what sells most?" is answerable whatever the similarity ranking says. */
export const BEST_SELLERS_LIMIT = 5;
export const REMOVED_PRODUCTS_LIMIT = 10;
export const RECENT_SALES_LIMIT = 10;

/** Cancellation is checked between steps so a "Stop" never starts the next (expensive) one. */
function ensureNotAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        throw new RequestAbortedError();
    }
}

function addTotals(left: SalesTotals, right: SalesTotals): SalesTotals {
    return {
        sales_count: left.sales_count + right.sales_count,
        units: left.units + right.units,
        revenue_cents: left.revenue_cents + right.revenue_cents,
    };
}

const byRevenueDesc = (left: ProductSalesSummary, right: ProductSalesSummary): number =>
    right.all_time.revenue_cents - left.all_time.revenue_cents;

@Injectable()
export class ChatService {
    constructor(
        @Inject(CHAT_CONTEXT_REPOSITORY)
        private readonly chatContextRepository: ChatContextRepository,
        @Inject(OLLAMA_GATEWAY)
        private readonly ollamaGateway: OllamaGateway,
        private readonly productRetriever: ProductRetriever,
        private readonly chatConcurrencyLimiter: ChatConcurrencyLimiter,
    ) {}

    /**
     * Answers the conversation grounded on the user's own catalog and sales. The same `signal` reaches the
     * context queries' checkpoints, the embedding call and the Ollama chat call (BACKEND_SCOPE.md §2,
     * "Cancelamento do botão Stop", step 2); a cancellation always surfaces as `RequestAbortedError`.
     * The request body was validated upstream: 1..20 user/assistant messages, the last one from the user.
     * 429 TOO_MANY_REQUESTS when the user or the process already has the maximum of chats in flight; the
     * slot is given back however the request ends (reply, error, timeout or cancellation).
     */
    async reply(user: AuthUser, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
        ensureNotAborted(signal);

        const release = this.chatConcurrencyLimiter.acquire(user.id);
        try {
            return await this.generateReply(user, messages, signal);
        } finally {
            release();
        }
    }

    private async generateReply(user: AuthUser, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
        const question = messages.filter((message) => message.role === CHAT_ROLE.USER).at(-1)?.content ?? '';
        const context = await this.buildContext(user, question, signal);

        ensureNotAborted(signal);

        // Our system message is always first; client messages keep only their own role and content.
        const prompt: OllamaChatMessage[] = [
            { role: 'system', content: buildSystemPrompt(formatChatContext(context)) },
            ...messages.map((message): OllamaChatMessage => ({ role: message.role, content: message.content })),
        ];

        const reply = await this.ollamaGateway.chat(prompt, signal);

        // The client sends this reply back as an `assistant` message next turn, so it must fit the same contract limit.
        return truncateReply(reply, CHAT_MAX_CONTENT_LENGTH);
    }

    private async buildContext(user: AuthUser, question: string, signal: AbortSignal): Promise<ChatContext> {
        const scope: UserScope = { user_id: user.id };
        const timezone = user.timezone;
        const today = todayIn(timezone);
        const last7DaysStart = addDays(today, -6);
        const last30DaysStart = addDays(today, -29);
        const windows: SalesWindows = {
            today: localDateRange(today, today, timezone),
            last_7_days: localDateRange(last7DaysStart, today, timezone),
            last_30_days: localDateRange(last30DaysStart, today, timezone),
        };

        const [products, summaries, recentSales, salesGoalCents] = await Promise.all([
            this.chatContextRepository.listProducts(scope),
            this.chatContextRepository.summarizeSalesByProduct(scope, windows),
            this.chatContextRepository.listRecentSales(scope, RECENT_SALES_LIMIT),
            this.chatContextRepository.findSalesGoalCents(scope),
        ]);

        ensureNotAborted(signal);

        const salesByProductId = new Map<string, ProductSalesSummary>();
        const removedProductSales: ProductSalesSummary[] = [];
        for (const summary of summaries) {
            if (summary.product_id === null) {
                removedProductSales.push(summary);
            } else {
                salesByProductId.set(summary.product_id, summary);
            }
        }

        const selected = await this.selectProducts(question, products, salesByProductId, signal);
        removedProductSales.sort(byRevenueDesc);

        return {
            timezone,
            today,
            last_7_days_start: last7DaysStart,
            last_30_days_start: last30DaysStart,
            catalog_size: products.length,
            products: selected.map((product): ProductContext => ({
                product,
                sales: salesByProductId.get(product.id) ?? null,
            })),
            removed_product_sales: removedProductSales.slice(0, REMOVED_PRODUCTS_LIMIT),
            removed_product_groups_omitted: Math.max(0, removedProductSales.length - REMOVED_PRODUCTS_LIMIT),
            totals: summaries.reduce(
                (totals, summary) => ({
                    all_time: addTotals(totals.all_time, summary.all_time),
                    last_30_days: addTotals(totals.last_30_days, summary.last_30_days),
                    last_7_days: addTotals(totals.last_7_days, summary.last_7_days),
                    today: addTotals(totals.today, summary.today),
                }),
                {
                    all_time: emptySalesTotals(),
                    last_30_days: emptySalesTotals(),
                    last_7_days: emptySalesTotals(),
                    today: emptySalesTotals(),
                },
            ),
            first_sale_at: summaries.reduce<Date | null>(
                (first, summary) => (first === null || summary.first_sale_at < first ? summary.first_sale_at : first),
                null,
            ),
            last_sale_at: summaries.reduce<Date | null>(
                (last, summary) => (last === null || summary.last_sale_at > last ? summary.last_sale_at : last),
                null,
            ),
            recent_sales: recentSales,
            sales_goal_cents: salesGoalCents,
        };
    }

    /** Small catalogs go in whole; larger ones keep the products relevant to the question plus the best sellers. */
    private async selectProducts(
        question: string,
        products: CatalogProduct[],
        salesByProductId: Map<string, ProductSalesSummary>,
        signal: AbortSignal,
    ): Promise<CatalogProduct[]> {
        if (products.length <= FULL_CATALOG_THRESHOLD) {
            return products;
        }

        const relevant = await this.productRetriever.findMostRelevant(
            question,
            products,
            RELEVANT_PRODUCTS_LIMIT,
            signal,
        );

        ensureNotAborted(signal);

        const bestSellerIds = [...salesByProductId.values()]
            .sort(byRevenueDesc)
            .slice(0, BEST_SELLERS_LIMIT)
            .map((summary) => summary.product_id);

        const selectedIds = new Set([...relevant.map((product) => product.id), ...bestSellerIds]);

        // `products` is ordered by name, so the context lists the selection alphabetically.
        return products.filter((product) => selectedIds.has(product.id));
    }
}
