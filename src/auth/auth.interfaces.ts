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
