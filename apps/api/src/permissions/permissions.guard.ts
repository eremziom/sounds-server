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
    const requirement = this.reflector.getAllAndOverride<
      string[] | { anyOf: string[] }
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    const requiredPermissions = Array.isArray(requirement)
      ? requirement
      : requirement?.anyOf;
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
    const hasPermission = (permission: string) =>
      grantedPermissions.has(permission);
    const hasRequiredPermissions = Array.isArray(requirement)
      ? requiredPermissions.every(hasPermission)
      : requiredPermissions.some(hasPermission);

    if (!hasRequiredPermissions) {
      throw new ForbiddenException('Missing required permission');
    }

    request.permissions = [...grantedPermissions];
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
