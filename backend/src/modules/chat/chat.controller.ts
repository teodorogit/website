import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { ApiErrorResponse, ApiUnauthorizedErrorResponse } from '@/common/decorators/http/api-error-response.decorator';
import { ERROR_CODE } from '@/common/errors/error-code';
import { AuthUser } from '../auth/auth-user';
import { ChatService } from './chat.service';
import { RequestAbortSignal } from './decorators/request-abort-signal.decorator';
import { ChatRequestDto } from './dto/chat-request.dto';
import { ChatResponseDto } from './dto/chat-response.dto';
import { LastMessageFromUserPipe } from './pipes/last-message-from-user.pipe';

@ApiTags('Chat')
@ApiBearerAuth()
@ApiUnauthorizedErrorResponse()
@Controller('chat')
export class ChatController {
    constructor(private readonly chatService: ChatService) {}

    @Post()
    @HttpCode(HttpStatus.OK)
    @ApiOperation({
        summary: 'Pergunta ao assistente sobre os dados do usuário',
        description:
            'Responde com base no catálogo e nas vendas do usuário autenticado. Se o cliente fechar a conexão (botão Parar), a geração no Ollama é cancelada e nenhuma resposta é escrita. Cada usuário pode ter um número limitado de perguntas em andamento ao mesmo tempo (429 acima disso).',
    })
    @ApiOkResponse({ type: ChatResponseDto })
    @ApiErrorResponse(HttpStatus.BAD_REQUEST, ERROR_CODE.VALIDATION_ERROR, ERROR_CODE.CHAT_LAST_MESSAGE_NOT_USER)
    @ApiErrorResponse(HttpStatus.TOO_MANY_REQUESTS, ERROR_CODE.TOO_MANY_REQUESTS)
    @ApiErrorResponse(HttpStatus.BAD_GATEWAY, ERROR_CODE.LLM_UNAVAILABLE, ERROR_CODE.LLM_INVALID_RESPONSE)
    async chat(
        @CurrentUser() user: AuthUser,
        @Body(LastMessageFromUserPipe) body: ChatRequestDto,
        @RequestAbortSignal() signal: AbortSignal,
    ): Promise<ChatResponseDto> {
        return new ChatResponseDto(await this.chatService.reply(user, body.messages, signal));
    }
}
