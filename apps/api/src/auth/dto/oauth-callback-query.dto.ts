import { ValidateIf, IsOptional, IsString, MaxLength } from 'class-validator';

export class OAuthCallbackQueryDto {
  @ValidateIf((dto: OAuthCallbackQueryDto) => !dto.error)
  @IsString()
  @MaxLength(2000)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  iss?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1024)
  scope?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  authuser?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  prompt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  cid?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  device_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  type?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  expires_in?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  ext_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  error_description?: string;
}
