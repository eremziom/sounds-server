import { UserResponse } from '../users/users.interfaces';

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: Date;
  refreshTokenExpiresAt: Date;
  user: UserResponse;
}

export interface JwtPayload {
  sid: string;
  sub: number;
  username: string;
  roles: string[];
}

export interface AuthenticatedUser {
  sessionId: string;
  sessionExpiresAt: Date;
  userId: number;
  username: string;
  roles: string[];
}

export interface AuthenticatedRequest {
  user: AuthenticatedUser;
}
