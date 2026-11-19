import { IsEnum, IsString, Length } from 'class-validator';
import { DevicePlatform } from '../device-token.entity';

/** Validated body for `POST /devices/register`; the user id always comes from the JWT. */
export class RegisterDeviceDto {
  @IsString()
  @Length(32, 4096)
  token!: string;

  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;
}
