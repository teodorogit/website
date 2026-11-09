import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { TokenVerificationError } from '@clerk/backend/errors';
import { EnvConfigService } from '@/common/env-config/env-config.service';
import { ClerkBackendTokenVerifier, JWKS_REFRESH_INTERVAL_MS, readKeyId } from '../clerk-token-verifier';

jest.mock('@clerk/backend', () => ({ verifyToken: jest.fn(), createClerkClient: jest.fn() }));

const mockedVerifyToken = verifyToken as jest.MockedFunction<typeof verifyToken>;
const mockedCreateClerkClient = createClerkClient as jest.MockedFunction<typeof createClerkClient>;
const getJwks = jest.fn();

function buildVerifier(env: Record<string, string>): ClerkBackendTokenVerifier {
    const configService = { get: (key: string) => env[key] } as unknown as ConfigService;
    return new ClerkBackendTokenVerifier(new EnvConfigService(configService));
}

/** A JWT-shaped string whose header carries `kid`; signature and claims are irrelevant (verifyToken is mocked). */
function tokenWithKid(kid: unknown): string {
    const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
    return `${encode({ alg: 'RS256', typ: 'JWT', kid })}.${encode({ sub: 'user_123' })}.signature`;
}

const KNOWN_KID = 'ins_known';
const baseEnv = {
    CLERK_SECRET_KEY: 'sk_test_x',
    CLERK_ISSUER: 'https://example.clerk.accounts.dev',
    FRONTEND_URL: 'http://localhost:5173',
};
const pemEnv = { ...baseEnv, CLERK_JWT_KEY: '-----BEGIN PUBLIC KEY-----' };

describe('readKeyId', () => {
    it('reads the kid from the JWT header', () => {
        expect(readKeyId(tokenWithKid('ins_abc'))).toBe('ins_abc');
    });

    it.each([
        ['not a JWT', 'jwt'],
        ['a non-JSON header', 'bm90LWpzb24.e30.sig'],
        ['a numeric kid', tokenWithKid(42)],
        ['an empty kid', tokenWithKid('')],
        ['four segments', `${tokenWithKid('ins_abc')}.extra`],
    ])('is null for %s', (_label, token) => {
        expect(readKeyId(token)).toBeNull();
    });
});

describe('ClerkBackendTokenVerifier', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        jest.useFakeTimers({ now: new Date('2026-11-05T12:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] });
        mockedCreateClerkClient.mockReturnValue({ jwks: { getJwks } } as never);
        getJwks.mockResolvedValue({ keys: [{ kid: KNOWN_KID }] });
        jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
        jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    it('verifies signature/expiry via Clerk and pins issuer and authorized parties', async () => {
        mockedVerifyToken.mockResolvedValueOnce({ sub: 'user_123' } as never);
        const token = tokenWithKid(KNOWN_KID);

        await expect(buildVerifier(baseEnv).verify(token)).resolves.toEqual({ sub: 'user_123' });
        expect(mockedVerifyToken).toHaveBeenCalledWith(token, {
            secretKey: 'sk_test_x',
            issuer: 'https://example.clerk.accounts.dev',
            authorizedParties: ['http://localhost:5173'],
        });
    });

    it('uses CLERK_JWT_KEY (networkless) and CLERK_AUTHORIZED_PARTIES when set, never fetching the JWKS', async () => {
        mockedVerifyToken.mockResolvedValueOnce({ sub: 'user_123' } as never);

        await buildVerifier({
            ...pemEnv,
            CLERK_AUTHORIZED_PARTIES: 'https://app.example.com, https://admin.example.com',
        }).verify('jwt');

        expect(mockedVerifyToken).toHaveBeenCalledWith(
            'jwt',
            expect.objectContaining({
                jwtKey: '-----BEGIN PUBLIC KEY-----',
                authorizedParties: ['https://app.example.com', 'https://admin.example.com'],
            }),
        );
        expect(getJwks).not.toHaveBeenCalled();
    });

    it('returns null when verifyToken throws a TokenVerificationError (expired, bad signature, wrong issuer…)', async () => {
        mockedVerifyToken.mockRejectedValueOnce(
            new TokenVerificationError({ reason: 'token-expired', message: 'JWT is expired' }),
        );

        await expect(buildVerifier(pemEnv).verify('jwt')).resolves.toBeNull();
    });

    it('returns null when the payload has no subject', async () => {
        mockedVerifyToken.mockResolvedValueOnce({ sub: '' } as never);

        await expect(buildVerifier(pemEnv).verify('jwt')).resolves.toBeNull();
    });

    it('returns null (401 upstream) when verification throws, e.g. JWKS unreachable', async () => {
        mockedVerifyToken.mockRejectedValueOnce(new Error('fetch failed'));

        await expect(buildVerifier(pemEnv).verify('jwt')).resolves.toBeNull();
    });

    describe('session status (sts claim)', () => {
        it('rejects a pending session (unfinished session tasks), like Clerk treatPendingAsSignedOut', async () => {
            mockedVerifyToken.mockResolvedValueOnce({ sub: 'user_x', sts: 'pending' } as never);

            await expect(buildVerifier(pemEnv).verify('jwt')).resolves.toBeNull();
        });

        it('accepts an active session', async () => {
            mockedVerifyToken.mockResolvedValueOnce({ sub: 'user_x', sts: 'active' } as never);

            await expect(buildVerifier(pemEnv).verify('jwt')).resolves.toEqual({ sub: 'user_x' });
        });

        it('accepts a v1 token without the claim', async () => {
            mockedVerifyToken.mockResolvedValueOnce({ sub: 'user_x' } as never);

            await expect(buildVerifier(pemEnv).verify('jwt')).resolves.toEqual({ sub: 'user_x' });
        });
    });

    describe('without CLERK_JWT_KEY: kid gate in front of the remote JWKS', () => {
        it('rejects a token without a readable kid without any network call', async () => {
            const verifier = buildVerifier(baseEnv);

            await expect(verifier.verify('jwt')).resolves.toBeNull();
            await expect(verifier.verify(tokenWithKid(7))).resolves.toBeNull();

            expect(getJwks).not.toHaveBeenCalled();
            expect(mockedVerifyToken).not.toHaveBeenCalled();
        });

        it('fetches the JWKS once for any number of unknown kids within the refresh interval', async () => {
            const verifier = buildVerifier(baseEnv);

            for (let index = 0; index < 50; index += 1) {
                await expect(verifier.verify(tokenWithKid(`ins_forged_${index}`))).resolves.toBeNull();
            }

            expect(getJwks).toHaveBeenCalledTimes(1);
            expect(mockedVerifyToken).not.toHaveBeenCalled();
        });

        it('shares one in-flight JWKS fetch between concurrent requests', async () => {
            const verifier = buildVerifier(baseEnv);

            await Promise.all(
                Array.from({ length: 20 }, (_, index) => verifier.verify(tokenWithKid(`ins_forged_${index}`))),
            );

            expect(getJwks).toHaveBeenCalledTimes(1);
        });

        it('verifies tokens with a known kid without fetching the JWKS again', async () => {
            mockedVerifyToken.mockResolvedValue({ sub: 'user_123' } as never);
            const verifier = buildVerifier(baseEnv);

            for (let index = 0; index < 5; index += 1) {
                await expect(verifier.verify(tokenWithKid(KNOWN_KID))).resolves.toEqual({ sub: 'user_123' });
            }

            expect(getJwks).toHaveBeenCalledTimes(1);
            expect(mockedVerifyToken).toHaveBeenCalledTimes(5);
            expect(mockedCreateClerkClient).toHaveBeenCalledWith({ secretKey: 'sk_test_x' });
        });

        it('picks up a rotated key on the first refresh allowed after the interval', async () => {
            mockedVerifyToken.mockResolvedValue({ sub: 'user_123' } as never);
            const verifier = buildVerifier(baseEnv);

            await expect(verifier.verify(tokenWithKid('ins_rotated'))).resolves.toBeNull();

            getJwks.mockResolvedValue({ keys: [{ kid: KNOWN_KID }, { kid: 'ins_rotated' }] });
            jest.advanceTimersByTime(JWKS_REFRESH_INTERVAL_MS - 1);
            await expect(verifier.verify(tokenWithKid('ins_rotated'))).resolves.toBeNull();
            expect(getJwks).toHaveBeenCalledTimes(1);

            jest.advanceTimersByTime(1);
            await expect(verifier.verify(tokenWithKid('ins_rotated'))).resolves.toEqual({ sub: 'user_123' });
            expect(getJwks).toHaveBeenCalledTimes(2);
        });

        it('returns null and keeps the previous key list when the JWKS fetch fails', async () => {
            mockedVerifyToken.mockResolvedValue({ sub: 'user_123' } as never);
            const verifier = buildVerifier(baseEnv);
            await verifier.verify(tokenWithKid(KNOWN_KID));

            getJwks.mockRejectedValueOnce(new Error('rate limited'));
            jest.advanceTimersByTime(JWKS_REFRESH_INTERVAL_MS);

            await expect(verifier.verify(tokenWithKid('ins_other'))).resolves.toBeNull();
            await expect(verifier.verify(tokenWithKid(KNOWN_KID))).resolves.toEqual({ sub: 'user_123' });
        });
    });
});
