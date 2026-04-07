import type { User } from '../users/users.interfaces'

export const users: User[] = [
    {
      id: 1,
      username: "max",
      password: "Test123!",
      email: "max@max.pl",
      bio: "bio",
      avatar: "avatar",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 2,
      username: "admin",
      password: "Test123!",
      email: "admin@admin.pl",
      bio: "bio",
      avatar: "avatar",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 3,
      username: "zexo",
      password: "Test123!",
      email: "zexo@gmail.pl",
      bio: "bio",
      avatar: "avatar",
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];
