import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import { ERROR_CODE } from '@/common/errors/error-code';
import { ErrorPayload } from '@/common/errors/error-response';
import { ChatRequestDto } from '../dto/chat-request.dto';
import { CHAT_ROLE } from '../entities/chat-message.entity';

/**
 * `@Body(LastMessageFromUserPipe)`: param pipes run after the global ValidationPipe, so the body is
 * already well-formed here. The contract requires the last message to be the user's, reported with its
 * own code (CHAT_LAST_MESSAGE_NOT_USER) rather than the generic VALIDATION_ERROR.
 */
@Injectable()
export class LastMessageFromUserPipe implements PipeTransform<ChatRequestDto, ChatRequestDto> {
    transform(body: ChatRequestDto): ChatRequestDto {
        if (body.messages.at(-1)?.role !== CHAT_ROLE.USER) {
            const payload: ErrorPayload = {
                errorCode: ERROR_CODE.CHAT_LAST_MESSAGE_NOT_USER,
                details: [{ field: 'messages', message: 'A última mensagem deve ser do usuário.' }],
            };

            throw new BadRequestException(payload);
        }

        return body;
    }
}
