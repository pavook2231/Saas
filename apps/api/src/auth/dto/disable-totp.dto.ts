import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class DisableTotpDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}
