export type UserRole = 'USER' | 'ARTIST' | 'ADMIN';

export interface AssignedRole {
  id: number;
  key: string;
  name: string;
  description: string | null;
}

export interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  bio: string | null;
  avatar: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles?: { role: AssignedRole }[];
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  bio: string | null;
  avatar: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  roles: AssignedRole[];
}
