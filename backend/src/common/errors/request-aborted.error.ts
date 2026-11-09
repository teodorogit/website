/**
 * The client closed the connection before the handler finished (e.g. the chat "Stop" button).
 * Thrown so in-flight work unwinds; `AllExceptionsFilter` never writes a response for it
 * and does not log it as a failure (BACKEND_SCOPE.md §2, "Cancelamento do botão Stop").
 */
export class RequestAbortedError extends Error {
    constructor(message = 'Request aborted by the client') {
        super(message);
        this.name = 'RequestAbortedError';
    }
}

/** True for our own abort error and for the DOMException/`AbortError` that `fetch` throws on `signal.abort()`. */
export function isAbortError(error: unknown): boolean {
    if (error instanceof RequestAbortedError) {
        return true;
    }

    return (
        typeof error === 'object' &&
        error !== null &&
        'name' in error &&
        (error as { name: unknown }).name === 'AbortError'
    );
}
