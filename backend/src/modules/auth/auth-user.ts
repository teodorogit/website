/** Key under which `ClerkAuthGuard` stores the resolved user on the Express request. */
export const AUTH_USER_REQUEST_KEY = 'authUser';

/** What handlers receive through `@CurrentUser()`. `id` is the local `users.id` used for every `user_id` filter. */
export type AuthUser = {
    id: string;
    clerk_user_id: string;
    /** IANA zone used to interpret calendar dates and week boundaries for this user. */
    timezone: string;
};
