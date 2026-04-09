import { IsEmail, IsString, MaxLength } from 'class-validator';

export class RequestEmailAuthCodeDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;
}
