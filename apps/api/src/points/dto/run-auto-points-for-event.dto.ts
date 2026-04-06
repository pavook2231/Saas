import { Type } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class RunAutoPointsForEventDto {
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  forceRecompute?: boolean;
}
