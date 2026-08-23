import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Single Session Guard
 * 
 * Ensures only one active session per user. Compares the JWT token
 * from the request with the currentToken stored in the database.
 * If they don't match, the session is invalidated (user logged in elsewhere).
 */
@Injectable()
export class SingleSessionGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new UnauthorizedException('Authentication required');
    }

    // Extract raw token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('No authorization token provided');
    }

    const token = authHeader.replace('Bearer ', '');

    // Check if token matches the current active token in DB
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.sub },
      select: { currentToken: true, isActive: true },
    });

    if (!dbUser) {
      throw new UnauthorizedException('User not found');
    }

    if (!dbUser.isActive) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    const activeSession = await this.prisma.deviceSession.findUnique({
      where: { token },
      select: { isActive: true },
    });

    if (activeSession) {
      if (!activeSession.isActive) {
        throw new UnauthorizedException(
          'Session expired. Please log in again.',
        );
      }
    } else if (dbUser.currentToken !== token) {
      throw new UnauthorizedException(
        'Session expired. Please log in again.',
      );
    }

    // Touch last active time if deviceSession exists
    if (activeSession) {
      await this.prisma.deviceSession.update({
        where: { token },
        data: { lastActiveAt: new Date() },
      });
    }

    return true;
  }
}
