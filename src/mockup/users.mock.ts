import type { User } from '../users/users.interfaces';

export const users: User[] = [
  {
    id: 1,
    username: 'max',
    password: 'Test123!',
    email: 'max@max.pl',
    roles: [
      {
        role: {
          id: 1,
          key: 'USER',
          name: 'User',
          description: 'Default user role.',
        },
      },
    ],
    bio: 'bio',
    avatar: 'avatar',
    isActive: true,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 2,
    username: 'admin',
    password: 'Test123!',
    email: 'admin@admin.pl',
    roles: [
      {
        role: {
          id: 3,
          key: 'ADMIN',
          name: 'Admin',
          description: 'Administrator role with full management access.',
        },
      },
    ],
    bio: 'bio',
    avatar: 'avatar',
    isActive: true,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: 3,
    username: 'zexo',
    password: 'Test123!',
    email: 'zexo@gmail.pl',
    roles: [
      {
        role: {
          id: 2,
          key: 'ARTIST',
          name: 'Artist',
          description: 'Artist role for users who can manage their own tracks.',
        },
      },
    ],
    bio: 'bio',
    avatar: 'avatar',
    isActive: true,
    emailVerifiedAt: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];
