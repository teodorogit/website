import crypto from 'node:crypto';
import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ALLOW_API_KEY_KEY, API_KEY_HEADER } from '@/common/decorators/allow-api-key.decorator';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { EnvConfigService } from '@/common/env-config/env-config.service';
import { ERROR_CODE } from '@/common/errors/error-code';
import { CLERK_TOKEN_VERIFIER, ClerkTokenVerifier } from '@/infrastructure/clerk/clerk-token-verifier.interface';
import { User } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/users.service';
import { AUTH_USER_REQUEST_KEY, AuthUser } from '../auth-user';

/**
 * Global guard (registered as APP_GUARD in AuthModule): every route needs a valid Clerk
 * session token unless marked `@Public()`. On success the local user row is resolved
 * (created on first access) and attached to the request for `@CurrentUser()`.
 *
 * Routes marked `@AllowApiKey()` also accept the `X-Api-Key` header, which authenticates as the
 * one account configured next to the key.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @Inject(CLERK_TOKEN_VERIFIER)
        private readonly tokenVerifier: ClerkTokenVerifier,
        private readonly usersService: UsersService,
        private readonly envConfigService: EnvConfigService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<Request>();
        const apiKey = request.headers[API_KEY_HEADER];

        // When the header is sent to a route that takes it, it is the credential: a wrong key is a
        // 401 even next to a valid session token. Anywhere else the header means nothing.
        const user =
            apiKey !== undefined && this.allowsApiKey(context)
                ? await this.authenticateApiKey(apiKey)
                : await this.authenticateSession(request);

        const authUser: AuthUser = {
            id: user.id,
            clerk_user_id: user.clerk_user_id,
            timezone: user.timezone,
        };
        (request as unknown as Record<string, unknown>)[AUTH_USER_REQUEST_KEY] = authUser;

        return true;
    }

    private allowsApiKey(context: ExecutionContext): boolean {
        // Handler only: a controller can't opt every route in, including the ones that write.
        return this.reflector.get<boolean | undefined>(ALLOW_API_KEY_KEY, context.getHandler()) === true;
    }

    private async authenticateSession(request: Request): Promise<User> {
        const token = extractBearerToken(request);
        if (!token) {
            throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED);
        }

        const verified = await this.tokenVerifier.verify(token);
        if (!verified) {
            throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED);
        }

        // Not wrapped in try/catch on purpose: a database failure here is a 500, not a 401.
        return this.usersService.findOrCreateByClerkUserId(verified.sub);
    }

    private async authenticateApiKey(apiKey: string | string[]): Promise<User> {
        const access = this.envConfigService.powerBiAccess;

        // A repeated header arrives as an array; no key configured means key access is off.
        if (!access || typeof apiKey !== 'string' || !sameSecret(apiKey, access.apiKey)) {
            throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED);
        }

        return this.usersService.findOrCreateByClerkUserId(access.clerkUserId);
    }
}

/** Compares in constant time; hashing first gives both sides the same length without leaking it. */
function sameSecret(received: string, expected: string): boolean {
    const digest = (value: string) => crypto.createHash('sha256').update(value).digest();
    return crypto.timingSafeEqual(digest(received), digest(expected));
}

export function extractBearerToken(request: Request): string | undefined {
    const header = request.headers.authorization;
    if (typeof header !== 'string') {
        return undefined;
    }

    const [scheme, token, ...rest] = header.trim().split(/\s+/);
    if (rest.length > 0 || scheme?.toLowerCase() !== 'bearer' || !token) {
        return undefined;
    }

    return token;
}
