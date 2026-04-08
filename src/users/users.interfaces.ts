export interface User {
  id: number;
  username: string;
  password: string;
  email: string;
  bio?: string | undefined;
  avatar?: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserResponse {
  id: number;
  username: string;
  email: string;
  bio?: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}
