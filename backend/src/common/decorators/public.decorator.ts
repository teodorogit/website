import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a route (or controller) out of the global `ClerkAuthGuard`. Every other route requires
 * a valid Clerk session token — authentication is deny-by-default.
 */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);
