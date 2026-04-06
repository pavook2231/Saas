import { IsEnum, IsOptional } from 'class-validator';
import { MembershipStatus, OrganizationRole } from '@prisma/client';

export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(OrganizationRole)
  role?: OrganizationRole;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
