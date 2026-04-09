import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class LoginWithEmailCodeDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @Length(4, 12)
  code!: string;
}
