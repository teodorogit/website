import { Injectable, Logger } from '@nestjs/common';
import { ClerkClient, createClerkClient, verifyToken } from '@clerk/backend';
import { TokenVerificationErrorReason } from '@clerk/backend/errors';
import { ENV_VARIABLE, EnvConfigService } from '@/common/env-config/env-config.service';
import { ClerkTokenVerifier, VerifiedClerkToken } from './clerk-token-verifier.interface';

/** Verification failures caused by key/config trouble rather than by the token itself: worth a warning. */
const KEY_LOADING_FAILURES: ReadonlySet<string> = new Set([
    TokenVerificationErrorReason.InvalidSecretKey,
    TokenVerificationErrorReason.LocalJWKMissing,
    TokenVerificationErrorReason.RemoteJWKFailedToLoad,
    TokenVerificationErrorReason.RemoteJWKInvalid,
    TokenVerificationErrorReason.JWKFailedToResolve,
]);

const KNOWN_REASONS: ReadonlySet<string> = new Set(Object.values(TokenVerificationErrorReason));

/**
 * The reason of a TokenVerificationError, or null for any other error. Matched by shape: the class is
 * bundled separately in `@clerk/backend` and `@clerk/backend/errors`, so `instanceof` is always false.
 */
function verificationFailureReason(error: unknown): string | null {
    const reason = typeof error === 'object' && error !== null ? (error as { reason?: unknown }).reason : undefined;
    return typeof reason === 'string' && KNOWN_REASONS.has(reason) ? reason : null;
}

/** Without CLERK_JWT_KEY, the JWKS is fetched from Clerk at most once per this interval, whatever tokens arrive. */
export const JWKS_REFRESH_INTERVAL_MS = 60_000;

/** The `kid` of a JWT's header, or null when the token is not a JWT with a string `kid`. Never verifies anything. */
export function readKeyId(token: string): string | null {
    const parts = token.split('.');
    if (parts.length !== 3 || !parts[0]) {
        return null;
    }

    try {
        const header: unknown = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'));
        const kid = typeof header === 'object' && header !== null ? (header as { kid?: unknown }).kid : undefined;
        return typeof kid === 'string' && kid !== '' ? kid : null;
    } catch {
        return null;
    }
}

@Injectable()
export class ClerkBackendTokenVerifier implements ClerkTokenVerifier {
    private readonly logger = new Logger(ClerkBackendTokenVerifier.name);

    private clerkClient: ClerkClient | null = null;
    private knownKeyIds = new Set<string>();
    private lastJwksRefreshAt = Number.NEGATIVE_INFINITY;
    private jwksRefresh: Promise<void> | null = null;

    constructor(private readonly envConfigService: EnvConfigService) {}

    async verify(token: string): Promise<VerifiedClerkToken | null> {
        const jwtKey = this.envConfigService.get(ENV_VARIABLE.CLERK_JWT_KEY);

        // With the PEM key verification is networkless (production requires it, see config/configuration.ts).
        // Without it, verifyToken would call Clerk's JWKS endpoint for every unknown `kid`, which an
        // unauthenticated client could use to exhaust the instance's Backend API rate limit.
        if (!jwtKey && !(await this.hasKnownKeyId(token))) {
            this.logger.debug('Rejected Clerk token: unknown or missing kid');
            return null;
        }

        try {
            // The public `verifyToken` resolves with the token's payload and THROWS a TokenVerificationError
            // for an invalid token (expired, bad signature, wrong issuer or azp…). It does not return the
            // internal `{ data, errors }` envelope: destructuring that shape made every valid token look
            // like it had no `sub` (found by the manual test run of 2026-11-08).
            const payload = await verifyToken(token, {
                secretKey: this.envConfigService.getOrThrow(ENV_VARIABLE.CLERK_SECRET_KEY),
                issuer: this.envConfigService.getOrThrow(ENV_VARIABLE.CLERK_ISSUER),
                authorizedParties: this.envConfigService.clerkAuthorizedParties,
                ...(jwtKey && { jwtKey }),
            });

            if (typeof payload.sub !== 'string' || payload.sub === '') {
                this.logger.debug('Rejected Clerk token: no sub');
                return null;
            }

            // A pending session still has tasks to finish (forced password reset, MFA setup, choose an
            // organization); Clerk's frontend treats it as signed out, and so does the API. Tokens
            // without the claim (session token v1) predate session tasks and stay accepted.
            if (payload.sts !== undefined && payload.sts !== 'active') {
                this.logger.debug(`Rejected Clerk token: session status ${String(payload.sts)}`);
                return null;
            }

            return { sub: payload.sub };
        } catch (error) {
            const reason = verificationFailureReason(error);
            if (reason !== null && !KEY_LOADING_FAILURES.has(reason)) {
                // A bad token is the client's problem, not an operational event.
                this.logger.debug(`Rejected Clerk token: ${reason}`);
            } else {
                this.logger.warn(
                    `Clerk token verification failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            }

            return null;
        }
    }

    /** True when the token's `kid` is in Clerk's JWKS, refreshing that list at most once per interval. */
    private async hasKnownKeyId(token: string): Promise<boolean> {
        const kid = readKeyId(token);
        if (kid === null) {
            return false;
        }

        if (!this.knownKeyIds.has(kid)) {
            await this.refreshJwks();
        }

        return this.knownKeyIds.has(kid);
    }

    /** Concurrent callers share one in-flight fetch; a failed fetch keeps the previous list. */
    private refreshJwks(): Promise<void> {
        if (this.jwksRefresh) {
            return this.jwksRefresh;
        }

        if (Date.now() - this.lastJwksRefreshAt < JWKS_REFRESH_INTERVAL_MS) {
            return Promise.resolve();
        }

        this.lastJwksRefreshAt = Date.now();
        this.jwksRefresh = this.fetchKeyIds()
            .then((keyIds) => {
                this.knownKeyIds = keyIds;
            })
            .catch((error: unknown) => {
                this.logger.warn(
                    `Clerk JWKS refresh failed: ${error instanceof Error ? error.message : String(error)}`,
                );
            })
            .finally(() => {
                this.jwksRefresh = null;
            });

        return this.jwksRefresh;
    }

    private async fetchKeyIds(): Promise<Set<string>> {
        this.clerkClient ??= createClerkClient({
            secretKey: this.envConfigService.getOrThrow(ENV_VARIABLE.CLERK_SECRET_KEY),
        });

        const { keys } = await this.clerkClient.jwks.getJwks();
        return new Set((keys ?? []).map((key) => key.kid).filter((kid) => typeof kid === 'string' && kid !== ''));
    }
}
