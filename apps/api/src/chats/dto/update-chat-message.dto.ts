import { IsString, Length } from 'class-validator';

export class UpdateChatMessageDto {
  @IsString()
  @Length(1, 4000)
  body!: string;
}
