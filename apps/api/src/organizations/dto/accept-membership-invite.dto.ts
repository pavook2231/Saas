import { IsString, MaxLength, MinLength } from 'class-validator';

export class AcceptMembershipInviteDto {
  @IsString()
  @MinLength(32)
  @MaxLength(256)
  inviteToken!: string;
}
