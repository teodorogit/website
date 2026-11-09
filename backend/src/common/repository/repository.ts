/**
 * Row-level scope every user-owned repository method receives. Repositories MUST put
 * `user_id` in every `where` (reads, updates and deletes alike) — that is what makes
 * another user's row indistinguishable from a missing one (404, BACKEND_SCOPE.md §4).
 */
export type UserScope = {
    user_id: string;
};
