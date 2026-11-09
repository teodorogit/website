import { ObjectValues } from '@/common/types/types';

/** Roles a client may send. `system` is deliberately absent: only the server writes the system prompt. */
export const CHAT_ROLE = {
    USER: 'user',
    ASSISTANT: 'assistant',
} as const;

export type ChatRole = ObjectValues<typeof CHAT_ROLE>;

export type ChatMessage = {
    role: ChatRole;
    content: string;
};
