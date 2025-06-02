import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../roles/role.entity'; // Assuming you have a Role entity

@Entity('permissions')
export class Permission {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column()
  description: string;

  @Column()
  resource: string; // e.g., 'users', 'posts', 'orders'

  @Column()
  action: string; // e.g., 'create', 'read', 'update', 'delete'

  @Column({ default: true })
  isActive: boolean;

  @ManyToMany(() => Role, role => role.permissions)
  roles: Role[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

// permissions.dto.ts
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, PartialType } from '@nestjs/swagger';

export class CreatePermissionDto {
  @ApiProperty({ description: 'Permission name', example: 'users:create' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: 'Permission description', example: 'Create new users' })
  @IsString()
  @IsNotEmpty()
  description: string;

  @ApiProperty({ description: 'Resource name', example: 'users' })
  @IsString()
  @IsNotEmpty()
  resource: string;

  @ApiProperty({ description: 'Action name', example: 'create' })
  @IsString()
  @IsNotEmpty()
  action: string;

  @ApiProperty({ description: 'Is permission active', example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdatePermissionDto extends PartialType(CreatePermissionDto) {}

export class LinkRoleDto {
  @ApiProperty({ description: 'Role IDs to link', example: ['uuid1', 'uuid2'] })
  @IsUUID('4', { each: true })
  roleIds: string[];
}