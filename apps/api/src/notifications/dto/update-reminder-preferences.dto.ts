import { IsBoolean } from 'class-validator';

export class UpdateReminderPreferencesDto {
  @IsBoolean()
  enabled!: boolean;
}
