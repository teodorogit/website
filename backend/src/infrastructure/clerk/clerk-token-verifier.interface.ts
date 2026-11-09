export const CLERK_TOKEN_VERIFIER = 'ClerkTokenVerifier';

export type VerifiedClerkToken = {
    /** Clerk user id (`user_…`) — maps to `users.clerk_user_id`. */
    sub: string;
};

export interface ClerkTokenVerifier {
    /**
     * Verifies a Clerk session JWT: signature (JWKS via secret key, or the PEM `jwtKey`),
     * `exp`/`nbf`, `iss` against CLERK_ISSUER and `azp` against the authorized parties. Pending
     * sessions (`sts: "pending"`, unfinished session tasks) are rejected.
     * Returns null for any invalid/expired/foreign token — never throws for a bad token.
     */
    verify(token: string): Promise<VerifiedClerkToken | null>;
}
