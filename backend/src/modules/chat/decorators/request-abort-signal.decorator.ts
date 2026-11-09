import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * One AbortSignal per request that aborts when the client disconnects before the response was
 * written (BACKEND_SCOPE.md §2 "Cancelamento do botão Stop", step 1): the response emits `close`
 * while `writableEnded` is still false. A normal completion ends the response first, so it never aborts.
 */
export const RequestAbortSignal = createParamDecorator((_: unknown, ctx: ExecutionContext): AbortSignal => {
    const http = ctx.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const controller = new AbortController();

    // The client may already be gone (e.g. it hung up while the auth guard was running): `close` was emitted earlier.
    if (response.destroyed || request.socket.destroyed) {
        controller.abort();
        return controller.signal;
    }

    response.once('close', () => {
        if (!response.writableEnded) {
            controller.abort();
        }
    });

    return controller.signal;
});
