import { Inject, Injectable } from '@nestjs/common';
import { RequestAbortedError } from '@/common/errors/request-aborted.error';
import { centsToReais } from '@/common/utils/money.util';
import { OLLAMA_GATEWAY, OllamaGateway } from '@/infrastructure/ollama/ollama-gateway.interface';
import { CatalogProduct } from '../entities/chat-context.entity';
import { cosineSimilarity } from './cosine-similarity';
import { LruCache } from './lru-cache';

/** ~1,000 vectors of a few hundred floats each: a few MB at most, shared by all users of the process. */
export const PRODUCT_EMBEDDING_CACHE_SIZE = 1000;
/** Products embedded per chat request at most; the rest of a cold catalog fills the cache on later requests. */
export const MAX_EMBEDDINGS_PER_REQUEST = 200;
/** Product texts per /api/embed call (the question rides along with the first batch). */
export const EMBEDDING_BATCH_SIZE = 100;

/** Text embedded for a product. Name and price are what a question can refer to. */
export function productEmbeddingText(product: CatalogProduct): string {
    return `Produto: ${product.name}. Preço: R$ ${centsToReais(product.price_cents).toFixed(2)}.`;
}

/**
 * Picks the catalog products most related to the user's question by embedding similarity
 * (port of the old Express `rag.ts`, now over the user's real catalog).
 */
@Injectable()
export class ProductRetriever {
    /**
     * Keyed by model + product id + `updated_at`: product ids are UUIDs that belong to exactly one user,
     * so entries cannot leak across users, and editing a product changes `updated_at`, which makes its
     * old vector unreachable (it then ages out of the LRU).
     */
    private readonly cache = new LruCache<string, number[]>(PRODUCT_EMBEDDING_CACHE_SIZE);

    constructor(
        @Inject(OLLAMA_GATEWAY)
        private readonly ollamaGateway: OllamaGateway,
    ) {}

    /**
     * The `limit` products most similar to `question`, most similar first. Embeds at most
     * MAX_EMBEDDINGS_PER_REQUEST uncached products, in batches of EMBEDDING_BATCH_SIZE, so a large cold
     * catalog cannot turn one chat into an unbounded Ollama job. Products still without a vector rank last.
     */
    async findMostRelevant(
        question: string,
        products: CatalogProduct[],
        limit: number,
        signal: AbortSignal,
    ): Promise<CatalogProduct[]> {
        if (products.length === 0 || limit <= 0) {
            return [];
        }

        const model = this.ollamaGateway.embeddingModel();
        const keyOf = (product: CatalogProduct): string => `${model}:${product.id}:${product.updated_at.toISOString()}`;

        // Vectors for this request are held locally: a catalog larger than the cache could otherwise
        // evict an entry between filling the cache and ranking.
        const vectors = new Map<string, number[]>();
        const missing: CatalogProduct[] = [];

        for (const product of products) {
            const cached = this.cache.get(keyOf(product));
            if (cached) {
                vectors.set(product.id, cached);
            } else {
                missing.push(product);
            }
        }

        const toEmbed = missing.slice(0, MAX_EMBEDDINGS_PER_REQUEST);

        // The question is embedded together with the first batch of cache misses: a warm cache costs one call.
        const firstBatch = toEmbed.slice(0, EMBEDDING_BATCH_SIZE);
        const [questionEmbedding, ...firstEmbeddings] = await this.ollamaGateway.embed(
            [question, ...firstBatch.map(productEmbeddingText)],
            signal,
        );

        if (!questionEmbedding) {
            throw new Error('Embedding gateway returned no vector for the question');
        }

        const remember = (batch: CatalogProduct[], embeddings: number[][]): void => {
            batch.forEach((product, index) => {
                const embedding = embeddings[index];
                if (embedding) {
                    vectors.set(product.id, embedding);
                    this.cache.set(keyOf(product), embedding);
                }
            });
        };

        remember(firstBatch, firstEmbeddings);

        for (let start = EMBEDDING_BATCH_SIZE; start < toEmbed.length; start += EMBEDDING_BATCH_SIZE) {
            // A "Stop" between batches must not start the next one.
            if (signal.aborted) {
                throw new RequestAbortedError();
            }

            const batch = toEmbed.slice(start, start + EMBEDDING_BATCH_SIZE);
            remember(batch, await this.ollamaGateway.embed(batch.map(productEmbeddingText), signal));
        }

        return products
            .map((product) => {
                const embedding = vectors.get(product.id);
                return { product, similarity: embedding ? cosineSimilarity(questionEmbedding, embedding) : -Infinity };
            })
            .sort((left, right) => right.similarity - left.similarity)
            .slice(0, limit)
            .map(({ product }) => product);
    }
}
