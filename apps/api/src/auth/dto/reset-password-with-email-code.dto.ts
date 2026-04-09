import { IsEmail, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordWithEmailCodeDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(4, 12)
  code!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
