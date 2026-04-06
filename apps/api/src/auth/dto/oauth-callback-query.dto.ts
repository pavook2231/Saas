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
  @MaxLength(200)
  error?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  error_description?: string;
}
