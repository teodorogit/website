export const OLLAMA_GATEWAY = 'OllamaGateway';

export type OllamaChatRole = 'system' | 'user' | 'assistant';

export type OllamaChatMessage = {
    role: OllamaChatRole;
    content: string;
};

/**
 * Local Ollama server (BACKEND_SCOPE.md §5). Every call takes the request's AbortSignal so the
 * chat "Stop" button cancels the upstream generation too (§2 "Cancelamento do botão Stop").
 *
 * Errors: the caller aborting → `RequestAbortedError` (never a 502); timeout, network failure or
 * non-2xx → `BadGatewayException(LLM_UNAVAILABLE)`; unexpected body → `BadGatewayException(LLM_INVALID_RESPONSE)`.
 */
export interface OllamaGateway {
    /** Non-streaming chat completion (`stream: false`); resolves with the assistant's text. */
    chat(messages: OllamaChatMessage[], signal: AbortSignal): Promise<string>;

    /** One embedding per input, in input order, all with the same dimension. */
    embed(inputs: string[], signal: AbortSignal): Promise<number[][]>;

    /** Embedding model name: vectors from different models live in different spaces and must not be mixed. */
    embeddingModel(): string;
}
