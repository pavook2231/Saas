import { IsIn } from 'class-validator';

export class ReviewJoinRequestDto {
  @IsIn(['APPROVED', 'REJECTED'])
  status!: 'APPROVED' | 'REJECTED';
}
