export interface CreateRoleDto {
  name: string;
  description?: string;
  priority?: number;
  parentId?: string;
  permissionIds?: string[];
}

export interface UpdateRoleDto {
  name?: string;
  description?: string;
  priority?: number;
  parentId?: string;
}

export interface AssignPermissionsDto {
  permissionIds: string[];
  replace?: boolean;
}

export interface RevokePermissionsDto {
  permissionIds: string[];
}

export interface AssignRolesToUserDto {
  userId: string;
  roleIds: string[];
}

export interface RevokeRolesFromUserDto {
  roleIds: string[];
}
