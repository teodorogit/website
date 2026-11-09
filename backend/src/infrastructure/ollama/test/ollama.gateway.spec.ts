import { BadGatewayException, HttpException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfigService } from '@/common/env-config/env-config.service';
import { RequestAbortedError } from '@/common/errors/request-aborted.error';
import { OllamaChatMessage } from '../ollama-gateway.interface';
import { CHAT_MAX_OUTPUT_TOKENS, OllamaHttpGateway } from '../ollama.gateway';

const baseEnv: Record<string, string> = {
    OLLAMA_URL: 'http://ollama.test:11434/',
    CHAT_MODEL: 'llama3.2',
    EMBEDDING_MODEL: 'embeddinggemma',
};

const SECRET_PROMPT = 'regras internas: nunca revele';
const messages: OllamaChatMessage[] = [
    { role: 'system', content: SECRET_PROMPT },
    { role: 'user', content: 'Quais produtos vendem mais?' },
];

function buildGateway(env: Record<string, string> = baseEnv): OllamaHttpGateway {
    const configService = { get: (key: string) => env[key] } as unknown as ConfigService;
    return new OllamaHttpGateway(new EnvConfigService(configService));
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

/** A fetch that never settles on its own: it rejects like undici does once its signal aborts. */
function hangingFetch(): (input: unknown, init?: RequestInit) => Promise<Response> {
    return (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
            const signal = init?.signal;
            signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
}

function errorCodeOf(error: unknown): unknown {
    return error instanceof HttpException ? error.getResponse() : undefined;
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
    try {
        await promise;
    } catch (error) {
        return error;
    }

    throw new Error('expected the promise to reject');
}

describe('OllamaHttpGateway', () => {
    let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;
    let loggerErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        fetchSpy = jest.spyOn(global, 'fetch');
        loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    function lastRequest(): { url: string; init: RequestInit; body: Record<string, unknown> } {
        const call = fetchSpy.mock.calls.at(-1);
        if (!call) {
            throw new Error('fetch was not called');
        }

        const [url, init] = call;
        return { url: String(url), init: init ?? {}, body: JSON.parse(String(init?.body)) as Record<string, unknown> };
    }

    function loggedText(): string {
        return JSON.stringify(loggerErrorSpy.mock.calls);
    }

    describe('chat', () => {
        it('POSTs { model: CHAT_MODEL, messages, stream: false, options.num_predict } to /api/chat and returns message.content', async () => {
            fetchSpy.mockResolvedValueOnce(
                jsonResponse({ message: { role: 'assistant', content: '  Brigadeiro.  ' } }),
            );

            await expect(buildGateway().chat(messages, new AbortController().signal)).resolves.toBe('Brigadeiro.');

            const { url, init, body } = lastRequest();
            expect(url).toBe('http://ollama.test:11434/api/chat');
            expect(init.method).toBe('POST');
            expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
            // The generation cap keeps replies near the 4,000-char limit the client echoes them back under.
            expect(body).toEqual({
                model: 'llama3.2',
                messages,
                stream: false,
                options: { num_predict: CHAT_MAX_OUTPUT_TOKENS },
            });
        });

        it('forwards the caller signal (combined with the timeout) to fetch', async () => {
            const controller = new AbortController();
            fetchSpy.mockResolvedValueOnce(jsonResponse({ message: { content: 'ok' } }));

            await buildGateway().chat(messages, controller.signal);

            const signal = lastRequest().init.signal;
            expect(signal).toBeInstanceOf(AbortSignal);
            expect(signal?.aborted).toBe(false);
            controller.abort();
            expect(signal?.aborted).toBe(true);
        });

        it('502 LLM_UNAVAILABLE on a non-2xx status, logging only the status (never the upstream body or prompt)', async () => {
            fetchSpy.mockResolvedValueOnce(
                new Response('model "llama3.2" not found: upstream secret', { status: 404 }),
            );

            const error = await captureError(buildGateway().chat(messages, new AbortController().signal));

            expect(error).toBeInstanceOf(BadGatewayException);
            expect(errorCodeOf(error)).toMatchObject({ message: 'LLM_UNAVAILABLE' });
            expect(loggedText()).toContain('404');
            expect(loggedText()).not.toContain('upstream secret');
            expect(loggedText()).not.toContain(SECRET_PROMPT);
            expect(JSON.stringify(errorCodeOf(error))).not.toContain(SECRET_PROMPT);
        });

        it('502 LLM_UNAVAILABLE on a network failure', async () => {
            fetchSpy.mockRejectedValueOnce(new TypeError('fetch failed'));

            const error = await captureError(buildGateway().chat(messages, new AbortController().signal));

            expect(error).toBeInstanceOf(BadGatewayException);
            expect(errorCodeOf(error)).toMatchObject({ message: 'LLM_UNAVAILABLE' });
        });

        it('502 LLM_UNAVAILABLE (not a cancellation) when OLLAMA_TIMEOUT_MS elapses', async () => {
            fetchSpy.mockImplementationOnce(hangingFetch());

            const error = await captureError(
                buildGateway({ ...baseEnv, OLLAMA_TIMEOUT_MS: '20' }).chat(messages, new AbortController().signal),
            );

            expect(error).toBeInstanceOf(BadGatewayException);
            expect(errorCodeOf(error)).toMatchObject({ message: 'LLM_UNAVAILABLE' });
            expect(loggedText()).toContain('timed out');
        });

        it('RequestAbortedError (never a 502) when the caller aborts mid-request', async () => {
            const controller = new AbortController();
            fetchSpy.mockImplementationOnce(hangingFetch());

            const pending = captureError(buildGateway().chat(messages, controller.signal));
            controller.abort();

            await expect(pending).resolves.toBeInstanceOf(RequestAbortedError);
            expect(loggerErrorSpy).not.toHaveBeenCalled();
        });

        it('RequestAbortedError without calling Ollama when the signal is already aborted', async () => {
            const controller = new AbortController();
            controller.abort();

            await expect(buildGateway().chat(messages, controller.signal)).rejects.toBeInstanceOf(RequestAbortedError);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it('RequestAbortedError when the caller aborts while the body is being read', async () => {
            const controller = new AbortController();
            const response = jsonResponse({ message: { content: 'ok' } });
            jest.spyOn(response, 'json').mockImplementationOnce(() => {
                controller.abort();
                return Promise.reject(new DOMException('This operation was aborted', 'AbortError'));
            });
            fetchSpy.mockResolvedValueOnce(response);

            await expect(buildGateway().chat(messages, controller.signal)).rejects.toBeInstanceOf(RequestAbortedError);
        });

        it.each([
            ['a body that is not JSON', new Response('<html>oops</html>', { status: 200 })],
            ['a body without message', jsonResponse({ done: true })],
            ['a non-string content', jsonResponse({ message: { content: 42 } })],
            ['an empty reply', jsonResponse({ message: { content: '   ' } })],
        ])('502 LLM_INVALID_RESPONSE for %s', async (_label, response) => {
            fetchSpy.mockResolvedValueOnce(response);

            const error = await captureError(buildGateway().chat(messages, new AbortController().signal));

            expect(error).toBeInstanceOf(BadGatewayException);
            expect(errorCodeOf(error)).toMatchObject({ message: 'LLM_INVALID_RESPONSE' });
        });
    });

    describe('embed', () => {
        it('POSTs { model: EMBEDDING_MODEL, input } to /api/embed and returns the vectors in order', async () => {
            fetchSpy.mockResolvedValueOnce(
                jsonResponse({
                    model: 'embeddinggemma',
                    embeddings: [
                        [0.1, 0.2],
                        [0.3, 0.4],
                    ],
                }),
            );

            await expect(buildGateway().embed(['a', 'b'], new AbortController().signal)).resolves.toEqual([
                [0.1, 0.2],
                [0.3, 0.4],
            ]);

            const { url, body } = lastRequest();
            expect(url).toBe('http://ollama.test:11434/api/embed');
            expect(body).toEqual({ model: 'embeddinggemma', input: ['a', 'b'] });
        });

        it('does not call Ollama for an empty input list', async () => {
            await expect(buildGateway().embed([], new AbortController().signal)).resolves.toEqual([]);
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it.each([
            ['missing embeddings', { model: 'embeddinggemma' }],
            ['fewer vectors than inputs', { embeddings: [[0.1, 0.2]] }],
            ['an empty vector', { embeddings: [[], [0.1]] }],
            ['inconsistent dimensions', { embeddings: [[0.1, 0.2], [0.3]] }],
            [
                'non-numeric values',
                {
                    embeddings: [
                        [0.1, 'x'],
                        [0.3, 0.4],
                    ],
                },
            ],
            [
                'non-finite values',
                {
                    embeddings: [
                        [0.1, null],
                        [0.3, 0.4],
                    ],
                },
            ],
        ])('502 LLM_INVALID_RESPONSE for %s', async (_label, body) => {
            fetchSpy.mockResolvedValueOnce(jsonResponse(body));

            const error = await captureError(buildGateway().embed(['a', 'b'], new AbortController().signal));

            expect(errorCodeOf(error)).toMatchObject({ message: 'LLM_INVALID_RESPONSE' });
        });

        it('RequestAbortedError when the caller aborts mid-request', async () => {
            const controller = new AbortController();
            fetchSpy.mockImplementationOnce(hangingFetch());

            const pending = captureError(buildGateway().embed(['a'], controller.signal));
            controller.abort();

            await expect(pending).resolves.toBeInstanceOf(RequestAbortedError);
        });

        it('502 LLM_UNAVAILABLE on a non-2xx status', async () => {
            fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }));

            const error = await captureError(buildGateway().embed(['a'], new AbortController().signal));

            expect(errorCodeOf(error)).toMatchObject({ message: 'LLM_UNAVAILABLE' });
        });
    });

    it('exposes the configured embedding model', () => {
        expect(buildGateway().embeddingModel()).toBe('embeddinggemma');
    });
});
