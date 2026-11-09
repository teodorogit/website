import { ExecutionContext, UnauthorizedException, createParamDecorator } from '@nestjs/common';
import { Request } from 'express';
import { ERROR_CODE } from '../errors/error-code';
import { AuthUser, AUTH_USER_REQUEST_KEY } from '@/modules/auth/auth-user';

export function getAuthUserFromRequest(request: Request): AuthUser | undefined {
    const user: unknown = (request as unknown as Record<string, unknown>)[AUTH_USER_REQUEST_KEY];

    if (
        typeof user !== 'object' ||
        user === null ||
        typeof (user as AuthUser).id !== 'string' ||
        typeof (user as AuthUser).clerk_user_id !== 'string' ||
        typeof (user as AuthUser).timezone !== 'string'
    ) {
        return undefined;
    }

    return user as AuthUser;
}

/**
 * The authenticated user, resolved by `ClerkAuthGuard` from the verified token's `sub`.
 * This is the ONLY source of the data owner — never accept a user id from body/query/params
 * (BACKEND_SCOPE.md §1).
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
    const user = getAuthUserFromRequest(ctx.switchToHttp().getRequest<Request>());

    if (!user) {
        throw new UnauthorizedException(ERROR_CODE.UNAUTHORIZED);
    }

    return user;
});
