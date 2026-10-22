export interface Permission {
  id: number;
  key: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreatePermissionData = Pick<
  Permission,
  'key' | 'name' | 'description'
>;

export type UpdatePermissionData = Partial<CreatePermissionData>;
