import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class OAuthStartQueryDto {
  @IsOptional()
  @IsString()
  @Matches(/^\/(?!\/).*/, {
    message: 'OAuth return path must stay inside the current application.',
  })
  @MaxLength(512)
  state?: string;
}
