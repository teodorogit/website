import { ApiProperty } from '@nestjs/swagger';

export class ChatResponseDto {
    @ApiProperty({ example: 'O Brigadeiro é o seu produto mais vendido nos últimos 30 dias.' })
    reply: string;

    constructor(reply: string) {
        this.reply = reply;
    }
}
