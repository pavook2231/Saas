import { IsOptional, IsString } from 'class-validator';

export class BeginTotpSetupDto {
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
