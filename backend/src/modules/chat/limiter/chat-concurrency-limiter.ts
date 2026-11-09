import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { EnvConfigService } from '@/common/env-config/env-config.service';
import { ERROR_CODE } from '@/common/errors/error-code';

/** Gives back a slot taken by `acquire`. Safe to call more than once. */
export type ReleaseChatSlot = () => void;

/**
 * Bounds in-flight POST /api/chat work. Each request can hold the single local Ollama for up to two
 * calls of OLLAMA_TIMEOUT_MS each, so without a bound one user (or a burst of users) could queue
 * enough generations to starve everyone else. Per-process state: with several API instances each
 * applies its own limits.
 */
@Injectable()
export class ChatConcurrencyLimiter {
    private readonly inFlightByUser = new Map<string, number>();
    private inFlightTotal = 0;

    constructor(private readonly envConfigService: EnvConfigService) {}

    /** Takes a slot for `userId`, or throws 429 TOO_MANY_REQUESTS when the user or the process is at its limit. */
    acquire(userId: string): ReleaseChatSlot {
        const userInFlight = this.inFlightByUser.get(userId) ?? 0;

        if (
            userInFlight >= this.envConfigService.chatMaxInflightPerUser ||
            this.inFlightTotal >= this.envConfigService.chatMaxInflightGlobal
        ) {
            throw new HttpException(ERROR_CODE.TOO_MANY_REQUESTS, HttpStatus.TOO_MANY_REQUESTS);
        }

        this.inFlightByUser.set(userId, userInFlight + 1);
        this.inFlightTotal += 1;

        let released = false;
        return () => {
            if (released) {
                return;
            }

            released = true;
            this.inFlightTotal -= 1;

            const remaining = (this.inFlightByUser.get(userId) ?? 1) - 1;
            if (remaining > 0) {
                this.inFlightByUser.set(userId, remaining);
            } else {
                this.inFlightByUser.delete(userId);
            }
        };
    }

    /** In-flight chat requests of one user (0 when none). */
    inFlightFor(userId: string): number {
        return this.inFlightByUser.get(userId) ?? 0;
    }

    /** In-flight chat requests of the whole process. */
    get inFlight(): number {
        return this.inFlightTotal;
    }
}
