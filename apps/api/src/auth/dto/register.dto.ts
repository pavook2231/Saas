import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
    message:
      'password must contain at least one uppercase letter, one lowercase letter, and one number',
  })
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  participantInviteToken?: string;

  @IsOptional()
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  organizationInviteToken?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(64)
  organizationJoinCode?: string;
}
