import { IsEnum, IsString, Length } from 'class-validator';
import { UserRole } from '../../users/user.entity';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  role!: UserRole;

  /** Required: privilege changes must be explainable in the audit trail. */
  @IsString()
  @Length(5, 500)
  reason!: string;
}
