import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterWebPushSubscriptionDto {
  @IsString()
  @MinLength(24)
  @MaxLength(4096)
  endpoint!: string;
}
