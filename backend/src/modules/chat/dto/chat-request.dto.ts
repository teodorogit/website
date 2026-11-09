import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
    ArrayMaxSize,
    ArrayMinSize,
    IsArray,
    IsIn,
    IsNotEmpty,
    IsString,
    MaxLength,
    ValidateNested,
} from 'class-validator';
import { TrimTransformer } from '@/common/transformers/trim.transformer';
import { CHAT_ROLE, ChatRole } from '../entities/chat-message.entity';

/** Contract limits (BACKEND_SCOPE.md §2 "Assistente de conversação"). */
export const CHAT_MAX_MESSAGES = 20;
export const CHAT_MAX_CONTENT_LENGTH = 4000;

export class ChatMessageDto {
    @ApiProperty({ enum: Object.values(CHAT_ROLE), example: CHAT_ROLE.USER })
    @IsIn(Object.values(CHAT_ROLE), { message: 'Deve ser "user" ou "assistant".' })
    role!: ChatRole;

    @ApiProperty({ example: 'Quais produtos vendem mais?', maxLength: CHAT_MAX_CONTENT_LENGTH })
    @TrimTransformer()
    @IsString()
    @IsNotEmpty()
    @MaxLength(CHAT_MAX_CONTENT_LENGTH)
    content!: string;
}

export class ChatRequestDto {
    @ApiProperty({
        type: ChatMessageDto,
        isArray: true,
        minItems: 1,
        maxItems: CHAT_MAX_MESSAGES,
        description: 'Histórico recente; a última mensagem deve ser do usuário.',
    })
    @IsArray()
    @ArrayMinSize(1, { message: 'Envie ao menos uma mensagem.' })
    @ArrayMaxSize(CHAT_MAX_MESSAGES)
    @ValidateNested({ each: true })
    @Type(() => ChatMessageDto)
    messages!: ChatMessageDto[];
}
