import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class EnableTotpDto {
  @IsString()
  @IsNotEmpty()
  code!: string;

  @IsOptional()
  @IsString()
  currentPassword?: string;
}
