import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  lastName?: string;

  @IsOptional()
  @IsString()
  @ValidateIf((_, value) => typeof value !== 'string' || value.trim().length > 0)
  @IsUrl(
    {
      protocols: ['http', 'https'],
      require_protocol: true,
    },
    { message: 'Ссылка на аватар должна начинаться с http:// или https://' },
  )
  @MaxLength(512)
  avatarUrl?: string;
}
