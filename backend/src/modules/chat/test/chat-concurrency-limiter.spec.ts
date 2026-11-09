import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfigService } from '@/common/env-config/env-config.service';
import { ERROR_CODE } from '@/common/errors/error-code';
import { ChatConcurrencyLimiter } from '../limiter/chat-concurrency-limiter';

function limiterWith(env: Record<string, string> = {}): ChatConcurrencyLimiter {
    return new ChatConcurrencyLimiter(
        new EnvConfigService({ get: (key: string) => env[key] } as unknown as ConfigService),
    );
}

const tooManyRequests = new HttpException(ERROR_CODE.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);

describe('ChatConcurrencyLimiter', () => {
    it('allows one chat in flight per user by default and 429s the next', () => {
        const limiter = limiterWith();

        const release = limiter.acquire('alice');
        expect(() => limiter.acquire('alice')).toThrow(tooManyRequests);

        release();
        expect(() => limiter.acquire('alice')).not.toThrow();
    });

    it('applies the process-wide limit across users (default 4)', () => {
        const limiter = limiterWith();
        ['a', 'b', 'c', 'd'].forEach((user) => limiter.acquire(user));

        expect(() => limiter.acquire('e')).toThrow(tooManyRequests);
        expect(limiter.inFlight).toBe(4);
    });

    it('reads both limits from the environment', () => {
        const limiter = limiterWith({ CHAT_MAX_INFLIGHT_PER_USER: '2', CHAT_MAX_INFLIGHT_GLOBAL: '3' });

        limiter.acquire('alice');
        limiter.acquire('alice');
        expect(() => limiter.acquire('alice')).toThrow(tooManyRequests);

        limiter.acquire('bob');
        expect(() => limiter.acquire('carol')).toThrow(tooManyRequests);
    });

    it('a rejected acquire takes no slot', () => {
        const limiter = limiterWith();
        limiter.acquire('alice');

        expect(() => limiter.acquire('alice')).toThrow(tooManyRequests);
        expect(limiter.inFlightFor('alice')).toBe(1);
        expect(limiter.inFlight).toBe(1);
    });

    it('releasing twice gives back only one slot', () => {
        const limiter = limiterWith({ CHAT_MAX_INFLIGHT_PER_USER: '2' });
        const first = limiter.acquire('alice');
        limiter.acquire('alice');

        first();
        first();

        expect(limiter.inFlightFor('alice')).toBe(1);
        expect(limiter.inFlight).toBe(1);
        expect(() => limiter.acquire('alice')).not.toThrow();
        expect(() => limiter.acquire('alice')).toThrow(tooManyRequests);
    });
});
