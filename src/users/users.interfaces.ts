export type UserRole = 'USER' | 'ARTIST' | 'ADMIN';

export interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  role: UserRole;
  bio: string | null;
  avatar: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  role: UserRole;
  bio: string | null;
  avatar: string | null;
  isActive: boolean;
  emailVerifiedAt: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
