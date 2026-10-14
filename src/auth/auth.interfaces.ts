import { UserResponse } from '../users/users.interfaces';

export interface AuthResponse {
  accessToken: string;
  user: UserResponse;
}

export interface JwtPayload {
  sub: number;
  username: string;
  roles: string[];
}

export interface AuthenticatedUser {
  userId: number;
  username: string;
  roles: string[];
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}
