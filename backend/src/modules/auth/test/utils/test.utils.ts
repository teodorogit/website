import { mockedClerkTokenVerifier } from '@/infrastructure/clerk/mock/clerk-token-verifier.mock';
import { User } from '@/modules/users/entities/user.entity';
import { defaultUser, mockedUsersService } from '@/modules/users/test/utils/test.utils';
import { AuthUser } from '../../auth-user';

export const TEST_TOKEN = 'test-session-token';

/** Header for supertest: `.set(AUTH_HEADER)`. */
export const AUTH_HEADER = { Authorization: `Bearer ${TEST_TOKEN}` } as const;

export const defaultAuthUser = (user: User = defaultUser()): AuthUser => ({
    id: user.id,
    clerk_user_id: user.clerk_user_id,
    timezone: user.timezone,
});

/**
 * Makes the global `ClerkAuthGuard` accept `TEST_TOKEN` as `user` in e2e specs built with
 * `createE2eApp` (call after `jest.resetAllMocks()`). Returns the AuthUser handlers will receive.
 */
export function authenticateAs(user: User = defaultUser()): AuthUser {
    mockedClerkTokenVerifier.verify.mockImplementation(async (token: string) =>
        token === TEST_TOKEN ? { sub: user.clerk_user_id } : null,
    );
    mockedUsersService.findOrCreateByClerkUserId.mockImplementation(async (clerkUserId: string) =>
        clerkUserId === user.clerk_user_id ? user : new User({ clerk_user_id: clerkUserId }),
    );

    return defaultAuthUser(user);
}
