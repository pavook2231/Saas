import { IsOptional, IsString, MaxLength } from 'class-validator';

export class OAuthStartQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(512)
  state?: string;
}
