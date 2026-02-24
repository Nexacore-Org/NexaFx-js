import { IsBoolean } from 'class-validator';

export class ToggleFeatureFlagDto {
  @IsBoolean()
  enabled: boolean;
}
