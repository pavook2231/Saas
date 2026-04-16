import { IsOptional, IsString, MaxLength } from 'class-validator';

export class TestWebPushDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  clientDeviceId?: string;
}
