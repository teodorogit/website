import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '@/common/decorators/public.decorator';
import { ERROR_CODE } from '@/common/errors/error-code';
import { CLERK_TOKEN_VERIFIER, ClerkTokenVerifier } from '@/infrastructure/clerk/clerk-token-verifier.interface';
import { UsersService } from '@/modules/users/users.service';
import { AUTH_USER_REQUEST_KEY, AuthUser } from '../auth-user';

/**
 * Global guard (registered as APP_GUARD in AuthModule): every route needs a valid Clerk
 * session token unless marked `@Public()`. On success the local user row is resolved
 * (created on first access) and attached to the request for `@CurrentUser()`.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        @Inject(CLERK_TOKEN_VERIFIER)
        private readonly tokenVerifier: ClerkTokenVerifier,
        private readonly usersService: UsersService,
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
        const token = extractBearerToken(request);
        if (!token) {
            throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED);
        }

        const verified = await this.tokenVerifier.verify(token);
        if (!verified) {
            throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED);
        }

        // Not wrapped in try/catch on purpose: a database failure here is a 500, not a 401.
        const user = await this.usersService.findOrCreateByClerkUserId(verified.sub);

        const authUser: AuthUser = {
            id: user.id,
            clerk_user_id: user.clerk_user_id,
            timezone: user.timezone,
        };
        (request as unknown as Record<string, unknown>)[AUTH_USER_REQUEST_KEY] = authUser;

        return true;
    }
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
