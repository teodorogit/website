import crypto from 'node:crypto';
import { EntityProps } from '@/common/types/types';

/** The user's single sales goal (`sales_goals.user_id` is unique, BACKEND_SCOPE.md §3). */
export class SalesGoal {
    id: string;
    user_id: string;
    amount_cents: number;
    created_at: Date;
    updated_at: Date;

    constructor(params: EntityProps<SalesGoal>) {
        this.id = params.id ?? crypto.randomUUID();
        this.user_id = params.user_id;
        this.amount_cents = params.amount_cents;
        this.created_at = params.created_at ?? new Date();
        this.updated_at = params.updated_at ?? new Date();
    }
}
