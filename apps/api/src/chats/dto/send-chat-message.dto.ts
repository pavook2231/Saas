import { IsString, Length } from 'class-validator';

export class SendChatMessageDto {
  @IsString()
  @Length(1, 4000)
  body!: string;
}
