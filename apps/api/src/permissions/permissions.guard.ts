import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../auth/auth.interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { PERMISSIONS_KEY } from './permissions.decorator';

interface UserPermissionRecord {
  isActive: boolean;
  roles: {
    role: {
      permissions: {
        permission: {
          key: string;
        };
      }[];
    };
  }[];
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length) {
      return true;
    }

    const request = context
      .switchToHttp()
      .getRequest<Partial<AuthenticatedRequest>>();
    const userId = request.user?.userId;

    if (!userId) {
      throw new UnauthorizedException('Authentication required');
    }

    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        isActive: true,
        roles: {
          select: {
            role: {
              select: {
                permissions: {
                  select: {
                    permission: {
                      select: {
                        key: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user?.isActive) {
      throw new ForbiddenException(
        'User is not allowed to access this resource',
      );
    }

    const grantedPermissions = this.getGrantedPermissions(user);
    const hasRequiredPermissions = requiredPermissions.every((permission) =>
      grantedPermissions.has(permission),
    );

    if (!hasRequiredPermissions) {
      throw new ForbiddenException('Missing required permission');
    }

    return true;
  }

  private getGrantedPermissions(user: UserPermissionRecord): Set<string> {
    return new Set(
      user.roles.flatMap((userRole) =>
        userRole.role.permissions.map(
          (rolePermission) => rolePermission.permission.key,
        ),
      ),
    );
  }
}
