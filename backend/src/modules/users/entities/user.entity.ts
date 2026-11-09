import crypto from 'node:crypto';
import { EntityProps } from '@/common/types/types';
import { DEFAULT_TIMEZONE } from '@/common/utils/date.util';

/** Local mirror of a Clerk user, created on the first authenticated request (BACKEND_SCOPE.md §3). */
export class User {
    id: string;
    clerk_user_id: string;
    timezone: string;
    created_at: Date;
    updated_at: Date;

    constructor(params: Omit<EntityProps<User>, 'timezone'> & { timezone?: string }) {
        this.id = params.id ?? crypto.randomUUID();
        this.clerk_user_id = params.clerk_user_id;
        this.timezone = params.timezone ?? DEFAULT_TIMEZONE;
        this.created_at = params.created_at ?? new Date();
        this.updated_at = params.updated_at ?? new Date();
    }
}
