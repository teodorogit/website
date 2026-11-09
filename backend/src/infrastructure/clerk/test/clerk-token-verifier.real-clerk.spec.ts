import { createSign, generateKeyPairSync } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EnvConfigService } from '@/common/env-config/env-config.service';
import { ClerkBackendTokenVerifier } from '../clerk-token-verifier';

/**
 * Runs the REAL `@clerk/backend` verifyToken (no jest.mock) against tokens signed here, verified
 * networklessly through CLERK_JWT_KEY. The mocked spec next to this one once encoded the wrong
 * contract for verifyToken ({ data, errors } instead of payload/throw) and every valid token was
 * rejected in a running server; this spec keeps the adapter tied to the library's actual behaviour.
 */
const ISSUER = 'https://real-clerk-spec.clerk.accounts.dev';
const ORIGIN = 'http://localhost:5173';

const keyPair = () =>
    generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

const trusted = keyPair();
const untrusted = keyPair();

function sign(claims: Record<string, unknown>, privateKey = trusted.privateKey): string {
    const now = Math.floor(Date.now() / 1000);
    const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const payload = {
        azp: ORIGIN,
        exp: now + 300,
        iat: now - 5,
        iss: ISSUER,
        nbf: now - 5,
        sid: 'sess_spec',
        sts: 'active',
        sub: 'user_real_clerk',
        v: 2,
        ...claims,
    };
    const input = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'ins_spec' })}.${encode(payload)}`;
    return `${input}.${createSign('RSA-SHA256').update(input).sign(privateKey).toString('base64url')}`;
}

describe('ClerkBackendTokenVerifier with the real @clerk/backend', () => {
    const env: Record<string, string> = {
        CLERK_SECRET_KEY: 'sk_test_unused_networkless',
        CLERK_ISSUER: ISSUER,
        CLERK_JWT_KEY: trusted.publicKey,
        FRONTEND_URL: ORIGIN,
    };
    const verifier = new ClerkBackendTokenVerifier(
        new EnvConfigService({ get: (key: string) => env[key] } as unknown as ConfigService),
    );

    let warn: jest.SpyInstance;

    beforeEach(() => {
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
        warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('accepts a valid session token and returns its subject', async () => {
        await expect(verifier.verify(sign({}))).resolves.toEqual({ sub: 'user_real_clerk' });
    });

    it('accepts a v1-shaped token without the sts claim', async () => {
        await expect(verifier.verify(sign({ sts: undefined }))).resolves.toEqual({ sub: 'user_real_clerk' });
    });

    it.each([
        ['expired', { exp: Math.floor(Date.now() / 1000) - 60 }],
        ['not active yet (nbf in the future)', { nbf: Math.floor(Date.now() / 1000) + 600 }],
        ['issued by another issuer', { iss: 'https://evil.clerk.accounts.dev' }],
        ['issued for another origin (azp)', { azp: 'https://evil.example.com' }],
        ['a pending session', { sts: 'pending' }],
    ])('rejects a token that is %s, logging it at debug level only', async (_, claims) => {
        await expect(verifier.verify(sign(claims))).resolves.toBeNull();
        // A bad token is a client error, not an operational warning (the error class is matched by shape).
        expect(warn).not.toHaveBeenCalled();
    });

    it('rejects a token signed with a key the API does not trust', async () => {
        await expect(verifier.verify(sign({}, untrusted.privateKey))).resolves.toBeNull();
    });

    it('rejects a token whose payload was altered after signing', async () => {
        const [header, , signature] = sign({}).split('.');
        const forged = Buffer.from(JSON.stringify({ sub: 'user_someone_else', iss: ISSUER })).toString('base64url');

        await expect(verifier.verify(`${header}.${forged}.${signature}`)).resolves.toBeNull();
    });

    it('rejects garbage', async () => {
        await expect(verifier.verify('not-a-jwt')).resolves.toBeNull();
    });
});
