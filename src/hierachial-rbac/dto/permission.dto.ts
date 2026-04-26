export interface CreatePermissionDto {
  name: string;
  description?: string;
  action: string;
  resource: string;
  scope?: string;
  conditions?: Record<string, any>;
}

export interface UpdatePermissionDto {
  name?: string;
  description?: string;
  scope?: string;
  conditions?: Record<string, any>;
}
