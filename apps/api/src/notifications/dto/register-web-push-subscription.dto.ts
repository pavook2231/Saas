import {
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class WebPushKeysDto {
  @IsString()
  @MinLength(16)
  @MaxLength(512)
  p256dh!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(256)
  auth!: string;
}

export class RegisterWebPushSubscriptionDto {
  @IsString()
  @MinLength(24)
  @MaxLength(4096)
  endpoint!: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  deviceLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientDeviceId?: string;

  @IsObject()
  @ValidateNested()
  @Type(() => WebPushKeysDto)
  keys!: WebPushKeysDto;
}
