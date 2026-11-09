import { User } from '../entities/user.entity';

export const USER_REPOSITORY = 'UserRepository';

export interface UserRepository {
    findByClerkUserId(clerkUserId: string): Promise<User | null>;

    /** Inserts the user; rejects with the Prisma P2002 error if `clerk_user_id` already exists. */
    insert(user: User): Promise<User>;
}
