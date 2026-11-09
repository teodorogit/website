import { validate } from '../configuration';

const requiredEnv = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/brigadeiro',
    FRONTEND_URL: 'http://localhost:5173',
    CLERK_SECRET_KEY: 'sk_test_x',
    CLERK_ISSUER: 'https://example.clerk.accounts.dev',
    OLLAMA_URL: 'http://localhost:11434',
    CHAT_MODEL: 'llama3.2',
    EMBEDDING_MODEL: 'embeddinggemma',
};

describe('validate (boot-time environment check)', () => {
    it.each(['development', 'test'])('accepts NODE_ENV=%s without CLERK_JWT_KEY', (nodeEnv) => {
        const config = { ...requiredEnv, NODE_ENV: nodeEnv };
        expect(validate(config)).toBe(config);
    });

    it('lists every missing required variable', () => {
        expect(() => validate({ NODE_ENV: 'development', DATABASE_URL: ' ' })).toThrow(
            /Missing environment variables: DATABASE_URL, FRONTEND_URL, CLERK_SECRET_KEY/,
        );
    });

    it('requires CLERK_JWT_KEY in production (networkless token verification)', () => {
        expect(() => validate({ ...requiredEnv, NODE_ENV: 'production' })).toThrow(
            'Missing environment variables: CLERK_JWT_KEY (required in production)',
        );
        expect(() => validate({ ...requiredEnv, NODE_ENV: 'production', CLERK_JWT_KEY: '  ' })).toThrow(
            /CLERK_JWT_KEY/,
        );
        expect(
            validate({ ...requiredEnv, NODE_ENV: 'production', CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----' }),
        ).toEqual(expect.objectContaining({ NODE_ENV: 'production' }));
    });

    it('treats an unset NODE_ENV as production', () => {
        expect(() => validate({ ...requiredEnv })).toThrow(/CLERK_JWT_KEY \(required in production\)/);
        expect(() => validate({ ...requiredEnv, NODE_ENV: '' })).toThrow(/CLERK_JWT_KEY/);
    });

    it.each(['prod', 'Production', 'dev', 'staging'])('rejects the unknown NODE_ENV %p', (nodeEnv) => {
        expect(() => validate({ ...requiredEnv, NODE_ENV: nodeEnv, CLERK_JWT_KEY: 'pem' })).toThrow(
            `Invalid NODE_ENV "${nodeEnv}"`,
        );
    });
});
