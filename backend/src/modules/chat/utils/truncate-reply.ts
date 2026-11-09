const ELLIPSIS = '…';

/** A cut must keep at least this share of the limit; otherwise a boundary far back would throw away most of the reply. */
const MIN_KEPT_RATIO = 0.5;

/**
 * The client sends our replies back as `assistant` messages, which the contract caps at `maxLength`
 * characters (BACKEND_SCOPE.md §2). A longer reply would make every later turn of the conversation
 * fail with 400, so it is shortened here: at the last sentence end, else the last whitespace, else a
 * hard cut that never splits a surrogate pair. The result (ellipsis included) fits `maxLength`.
 */
export function truncateReply(reply: string, maxLength: number): string {
    if (reply.length <= maxLength) {
        return reply;
    }

    const budget = maxLength - ELLIPSIS.length;
    const head = reply.slice(0, budget);
    const minKept = Math.floor(budget * MIN_KEPT_RATIO);

    const sentenceEnd = lastMatchEnd(head, /[.!?](?=\s)/g);
    if (sentenceEnd >= minKept) {
        return `${head.slice(0, sentenceEnd)}${ELLIPSIS}`;
    }

    const whitespace = head.search(/\s\S*$/);
    if (whitespace >= minKept) {
        return `${head.slice(0, whitespace).trimEnd()}${ELLIPSIS}`;
    }

    const lastCode = head.charCodeAt(head.length - 1);
    const isHighSurrogate = lastCode >= 0xd800 && lastCode <= 0xdbff;
    return `${isHighSurrogate ? head.slice(0, -1) : head}${ELLIPSIS}`;
}

function lastMatchEnd(text: string, pattern: RegExp): number {
    let end = -1;
    for (const match of text.matchAll(pattern)) {
        end = match.index + match[0].length;
    }

    return end;
}
