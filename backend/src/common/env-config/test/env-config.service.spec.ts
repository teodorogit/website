import { ConfigService } from '@nestjs/config';
import { EnvConfigService, NODE_ENV } from '../env-config.service';

function serviceWith(env: Record<string, string | undefined>): EnvConfigService {
    return new EnvConfigService({ get: (key: string) => env[key] } as unknown as ConfigService);
}

describe('EnvConfigService', () => {
    describe('nodeEnv (fails closed)', () => {
        it.each([
            ['development', NODE_ENV.DEVELOPMENT],
            ['test', NODE_ENV.TEST],
            ['production', NODE_ENV.PRODUCTION],
        ])('%s → %s', (value, expected) => {
            expect(serviceWith({ NODE_ENV: value }).nodeEnv).toBe(expected);
        });

        it.each([undefined, '', 'prod', 'Production', 'Development'])(
            'treats %p as production, never development',
            (value) => {
                expect(serviceWith({ NODE_ENV: value }).nodeEnv).toBe(NODE_ENV.PRODUCTION);
            },
        );
    });

    describe('chat concurrency limits', () => {
        it('default to 1 per user and 4 per process', () => {
            const service = serviceWith({});
            expect(service.chatMaxInflightPerUser).toBe(1);
            expect(service.chatMaxInflightGlobal).toBe(4);
        });

        it('read positive integers and ignore anything else', () => {
            expect(serviceWith({ CHAT_MAX_INFLIGHT_PER_USER: '2' }).chatMaxInflightPerUser).toBe(2);
            expect(serviceWith({ CHAT_MAX_INFLIGHT_GLOBAL: '10' }).chatMaxInflightGlobal).toBe(10);
            expect(serviceWith({ CHAT_MAX_INFLIGHT_PER_USER: '0' }).chatMaxInflightPerUser).toBe(1);
            expect(serviceWith({ CHAT_MAX_INFLIGHT_GLOBAL: '2.5' }).chatMaxInflightGlobal).toBe(4);
        });
    });
});
