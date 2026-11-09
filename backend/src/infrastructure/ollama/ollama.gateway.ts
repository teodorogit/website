import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ENV_VARIABLE, EnvConfigService } from '@/common/env-config/env-config.service';
import { ERROR_CODE } from '@/common/errors/error-code';
import { RequestAbortedError } from '@/common/errors/request-aborted.error';
import { OllamaChatMessage, OllamaGateway } from './ollama-gateway.interface';

type OllamaEndpoint = '/api/chat' | '/api/embed';

/**
 * Generation cap (Ollama `num_predict`). The client sends replies back as `assistant` messages capped at
 * 4,000 characters (BACKEND_SCOPE.md §2); ~1,000 tokens is roughly that much pt-BR text, so generation stops
 * near the limit instead of producing text that gets cut. The chat service still enforces the hard limit.
 */
export const CHAT_MAX_OUTPUT_TOKENS = 1000;

@Injectable()
export class OllamaHttpGateway implements OllamaGateway {
    private readonly logger = new Logger(OllamaHttpGateway.name);

    constructor(private readonly envConfigService: EnvConfigService) {}

    embeddingModel(): string {
        return this.envConfigService.getOrThrow(ENV_VARIABLE.EMBEDDING_MODEL);
    }

    async chat(messages: OllamaChatMessage[], signal: AbortSignal): Promise<string> {
        const body = await this.post(
            '/api/chat',
            {
                model: this.envConfigService.getOrThrow(ENV_VARIABLE.CHAT_MODEL),
                messages,
                stream: false,
                options: { num_predict: CHAT_MAX_OUTPUT_TOKENS },
            },
            signal,
        );

        const content = readChatContent(body);
        if (content === null) {
            this.logger.error('Ollama /api/chat returned an unexpected body shape');
            throw new BadGatewayException(ERROR_CODE.LLM_INVALID_RESPONSE);
        }

        return content;
    }

    async embed(inputs: string[], signal: AbortSignal): Promise<number[][]> {
        if (inputs.length === 0) {
            return [];
        }

        const body = await this.post('/api/embed', { model: this.embeddingModel(), input: inputs }, signal);

        const embeddings = readEmbeddings(body, inputs.length);
        if (embeddings === null) {
            this.logger.error('Ollama /api/embed returned an unexpected body shape');
            throw new BadGatewayException(ERROR_CODE.LLM_INVALID_RESPONSE);
        }

        return embeddings;
    }

    /**
     * The caller's signal is combined with a per-call timeout. On failure, whichever signal fired
     * decides the outcome: the caller's → client cancellation; the timeout's → upstream unavailable.
     * Thrown messages and logs never carry prompts or upstream bodies.
     */
    private async post(endpoint: OllamaEndpoint, payload: unknown, signal: AbortSignal): Promise<unknown> {
        if (signal.aborted) {
            throw new RequestAbortedError();
        }

        const timeoutMs = this.envConfigService.ollamaTimeoutMs;
        const timeout = AbortSignal.timeout(timeoutMs);
        const baseUrl = this.envConfigService.getOrThrow(ENV_VARIABLE.OLLAMA_URL).replace(/\/+$/, '');

        let response: Response;
        try {
            response = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
                signal: AbortSignal.any([signal, timeout]),
            });
        } catch (error) {
            throw this.toUpstreamError(endpoint, error, signal, timeout, timeoutMs);
        }

        if (!response.ok) {
            this.logger.error(`Ollama ${endpoint} responded with status ${response.status}`);
            await response.body?.cancel().catch(() => undefined);
            throw new BadGatewayException(ERROR_CODE.LLM_UNAVAILABLE);
        }

        try {
            return await response.json();
        } catch (error) {
            // The body is streamed, so an abort or timeout can also surface while reading it.
            if (signal.aborted || timeout.aborted) {
                throw this.toUpstreamError(endpoint, error, signal, timeout, timeoutMs);
            }

            this.logger.error(`Ollama ${endpoint} returned a body that is not valid JSON`);
            throw new BadGatewayException(ERROR_CODE.LLM_INVALID_RESPONSE);
        }
    }

    private toUpstreamError(
        endpoint: OllamaEndpoint,
        error: unknown,
        signal: AbortSignal,
        timeout: AbortSignal,
        timeoutMs: number,
    ): Error {
        if (signal.aborted) {
            return new RequestAbortedError();
        }

        if (timeout.aborted) {
            this.logger.error(`Ollama ${endpoint} timed out after ${timeoutMs}ms`);
        } else {
            this.logger.error(
                `Ollama ${endpoint} request failed: ${error instanceof Error ? error.name : 'unknown error'}`,
            );
        }

        return new BadGatewayException(ERROR_CODE.LLM_UNAVAILABLE);
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** `{ message: { content: string } }`. An empty reply is invalid: it must never become an empty success. */
function readChatContent(body: unknown): string | null {
    if (!isRecord(body)) {
        return null;
    }

    const message = body['message'];
    if (!isRecord(message)) {
        return null;
    }

    const content = message['content'];
    if (typeof content !== 'string' || content.trim() === '') {
        return null;
    }

    return content.trim();
}

/** `{ embeddings: number[][] }` with one finite, non-empty vector per input, all of the same dimension. */
function readEmbeddings(body: unknown, expectedCount: number): number[][] | null {
    if (!isRecord(body)) {
        return null;
    }

    const embeddings = body['embeddings'];
    if (!Array.isArray(embeddings) || embeddings.length !== expectedCount) {
        return null;
    }

    let dimension: number | undefined;
    const vectors: number[][] = [];

    for (const vector of embeddings as unknown[]) {
        if (!isFiniteVector(vector)) {
            return null;
        }

        dimension ??= vector.length;
        if (vector.length !== dimension) {
            return null;
        }

        vectors.push(vector);
    }

    return vectors;
}

function isFiniteVector(value: unknown): value is number[] {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        value.every((item: unknown) => typeof item === 'number' && Number.isFinite(item))
    );
}
