import { RequestAbortedError } from '@/common/errors/request-aborted.error';
import { mockedOllamaGateway } from '@/infrastructure/ollama/mock/ollama-gateway.mock';
import { OllamaGateway } from '@/infrastructure/ollama/ollama-gateway.interface';
import { cosineSimilarity } from '../retrieval/cosine-similarity';
import { LruCache } from '../retrieval/lru-cache';
import { MAX_PRODUCTS_PER_USER } from '@/modules/products/products.service';
import {
    EMBEDDING_BATCH_SIZE,
    MAX_EMBEDDINGS_PER_REQUEST,
    PRODUCT_EMBEDDING_CACHE_SIZE,
    ProductRetriever,
    productEmbeddingText,
} from '../retrieval/product-retriever';
import { defaultCatalogProduct } from './utils/test.utils';

describe('cosineSimilarity', () => {
    it('is 1 for parallel, 0 for orthogonal and -1 for opposite vectors', () => {
        expect(cosineSimilarity([1, 2], [2, 4])).toBeCloseTo(1);
        expect(cosineSimilarity([1, 0], [0, 3])).toBeCloseTo(0);
        expect(cosineSimilarity([1, 1], [-1, -1])).toBeCloseTo(-1);
    });

    it('is 0 for a zero vector instead of NaN', () => {
        expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    });

    it('rejects vectors of different dimensions', () => {
        expect(() => cosineSimilarity([1, 0], [1, 0, 0])).toThrow(RangeError);
    });
});

describe('LruCache', () => {
    it('evicts the least recently used entry beyond its capacity', () => {
        const cache = new LruCache<string, number>(2);
        cache.set('a', 1);
        cache.set('b', 2);
        cache.get('a'); // "b" is now the least recently used
        cache.set('c', 3);

        expect(cache.get('b')).toBeUndefined();
        expect(cache.get('a')).toBe(1);
        expect(cache.get('c')).toBe(3);
        expect(cache.size).toBe(2);
    });

    it('rejects a non-positive capacity', () => {
        expect(() => new LruCache(0)).toThrow(RangeError);
    });
});

describe('ProductRetriever', () => {
    const brownie = defaultCatalogProduct({ id: '00000000-0000-4000-8000-000000000001', name: 'Brownie' });
    const brigadeiro = defaultCatalogProduct({ id: '00000000-0000-4000-8000-000000000002', name: 'Brigadeiro' });
    const cookie = defaultCatalogProduct({ id: '00000000-0000-4000-8000-000000000003', name: 'Cookie' });
    const vectors: Record<string, number[]> = { Brownie: [0.9, 0.1], Brigadeiro: [0.1, 0.9], Cookie: [0.6, 0.4] };

    let retriever: ProductRetriever;

    beforeEach(() => {
        jest.resetAllMocks();
        retriever = new ProductRetriever(mockedOllamaGateway as unknown as OllamaGateway);
        mockedOllamaGateway.embeddingModel.mockReturnValue('embeddinggemma');
        mockedOllamaGateway.embed.mockImplementation(async (inputs: string[]) =>
            inputs.map((text) => {
                const name = Object.keys(vectors).find((key) => text.includes(`Produto: ${key}.`));
                return name ? vectors[name] : [1, 0];
            }),
        );
    });

    it('ranks by cosine similarity to the question and keeps the top `limit`', async () => {
        const result = await retriever.findMostRelevant(
            'brownie de chocolate',
            [brigadeiro, brownie, cookie],
            2,
            new AbortController().signal,
        );

        expect(result.map((product) => product.name)).toEqual(['Brownie', 'Cookie']);
    });

    it('embeds the question together with the products in a single call, forwarding the signal', async () => {
        const signal = new AbortController().signal;

        await retriever.findMostRelevant('pergunta', [brownie, cookie], 1, signal);

        expect(mockedOllamaGateway.embed).toHaveBeenCalledTimes(1);
        expect(mockedOllamaGateway.embed).toHaveBeenCalledWith(
            ['pergunta', productEmbeddingText(brownie), productEmbeddingText(cookie)],
            signal,
        );
    });

    it('caches product vectors per embedding model', async () => {
        await retriever.findMostRelevant('primeira', [brownie, cookie], 1, new AbortController().signal);
        await retriever.findMostRelevant('segunda', [brownie, cookie], 1, new AbortController().signal);

        expect(mockedOllamaGateway.embed.mock.calls[1]?.[0]).toEqual(['segunda']);

        mockedOllamaGateway.embeddingModel.mockReturnValue('another-model');
        await retriever.findMostRelevant('terceira', [brownie, cookie], 1, new AbortController().signal);

        expect(mockedOllamaGateway.embed.mock.calls[2]?.[0]).toHaveLength(3);
    });

    it('skips the embedding call for an empty catalog', async () => {
        await expect(retriever.findMostRelevant('pergunta', [], 5, new AbortController().signal)).resolves.toEqual([]);
        expect(mockedOllamaGateway.embed).not.toHaveBeenCalled();
    });

    it('embeds product name and price', () => {
        expect(productEmbeddingText(brownie)).toBe('Produto: Brownie. Preço: R$ 3.00.');
    });

    describe('per-request embedding budget', () => {
        const uuid = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
        const coldCatalog = (size: number) =>
            Array.from({ length: size }, (_, index) =>
                defaultCatalogProduct({ id: uuid(index + 1), name: `Item ${String(index + 1).padStart(3, '0')}` }),
            );
        const embedSizes = (): number[] =>
            mockedOllamaGateway.embed.mock.calls.map((call) => (call[0] as string[]).length);

        it('the user catalog cap stays below the shared cache size, so one user cannot evict everyone', () => {
            expect(MAX_PRODUCTS_PER_USER).toBeLessThan(PRODUCT_EMBEDDING_CACHE_SIZE);
        });

        it(`embeds at most ${MAX_EMBEDDINGS_PER_REQUEST} cold products per request, in batches of ${EMBEDDING_BATCH_SIZE}`, async () => {
            const products = coldCatalog(MAX_PRODUCTS_PER_USER);

            await retriever.findMostRelevant('pergunta', products, 8, new AbortController().signal);

            // The question rides along with the first batch.
            expect(embedSizes()).toEqual([EMBEDDING_BATCH_SIZE + 1, EMBEDDING_BATCH_SIZE]);
            expect(mockedOllamaGateway.embed.mock.calls[0]?.[0][0]).toBe('pergunta');
        });

        it('later requests fill the rest of the cache gradually', async () => {
            const products = coldCatalog(MAX_PRODUCTS_PER_USER);
            const signal = new AbortController().signal;

            await retriever.findMostRelevant('primeira', products, 8, signal);
            await retriever.findMostRelevant('segunda', products, 8, signal);
            await retriever.findMostRelevant('terceira', products, 8, signal);
            await retriever.findMostRelevant('quarta', products, 8, signal);

            expect(embedSizes()).toEqual([101, 100, 101, 100, 101, 1]);
        });

        it('ranks products still without a vector last', async () => {
            const products = coldCatalog(MAX_EMBEDDINGS_PER_REQUEST + 1);
            // Embedded products are orthogonal to the question (similarity 0), still above a missing vector.
            mockedOllamaGateway.embed.mockImplementation(async (inputs: string[]) =>
                inputs.map((text) => (text.startsWith('Produto:') ? [0, 1] : [1, 0])),
            );

            const result = await retriever.findMostRelevant(
                'pergunta',
                products,
                products.length,
                new AbortController().signal,
            );

            expect(result.at(-1)?.id).toBe(products.at(-1)?.id);
        });

        it('does not start the next batch after a Stop, but keeps the vectors already computed', async () => {
            const products = coldCatalog(MAX_EMBEDDINGS_PER_REQUEST);
            const controller = new AbortController();
            mockedOllamaGateway.embed.mockImplementationOnce(async (inputs: string[]) => {
                controller.abort();
                return inputs.map(() => [1, 0]);
            });

            await expect(retriever.findMostRelevant('pergunta', products, 8, controller.signal)).rejects.toBeInstanceOf(
                RequestAbortedError,
            );
            expect(mockedOllamaGateway.embed).toHaveBeenCalledTimes(1);

            await retriever.findMostRelevant('de novo', products, 8, new AbortController().signal);
            expect(embedSizes()).toEqual([EMBEDDING_BATCH_SIZE + 1, EMBEDDING_BATCH_SIZE + 1]);
        });
    });
});
