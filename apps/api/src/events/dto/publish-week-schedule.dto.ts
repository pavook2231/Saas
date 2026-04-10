import { IsDateString } from 'class-validator';

export class PublishWeekScheduleDto {
  @IsDateString()
  anchorDate!: string;
}
