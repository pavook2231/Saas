import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UnregisterWebPushSubscriptionDto {
  @IsString()
  @MinLength(24)
  @MaxLength(4096)
  endpoint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientDeviceId?: string;
}
