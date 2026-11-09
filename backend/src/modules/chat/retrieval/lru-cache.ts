/**
 * Bounded least-recently-used cache. A `Map` iterates in insertion order, so re-inserting on read
 * moves an entry to the "most recent" end and the first key is always the eviction candidate.
 */
export class LruCache<K, V> {
    private readonly entries = new Map<K, V>();

    constructor(private readonly maxEntries: number) {
        if (!Number.isInteger(maxEntries) || maxEntries < 1) {
            throw new RangeError(`maxEntries must be a positive integer, got ${maxEntries}`);
        }
    }

    get size(): number {
        return this.entries.size;
    }

    get(key: K): V | undefined {
        if (!this.entries.has(key)) {
            return undefined;
        }

        const value = this.entries.get(key) as V;
        this.entries.delete(key);
        this.entries.set(key, value);

        return value;
    }

    set(key: K, value: V): void {
        this.entries.delete(key);
        this.entries.set(key, value);

        while (this.entries.size > this.maxEntries) {
            const oldest = this.entries.keys().next();
            if (oldest.done) {
                break;
            }

            this.entries.delete(oldest.value);
        }
    }
}
