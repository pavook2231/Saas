import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { OrganizationRole } from '@prisma/client';

export class InviteMembershipDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: OrganizationRole;
}
