// Force TS re-evaluation after Prisma generation
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async login(email: string, password: string, ip = '127.0.0.1', userAgent = 'unknown') {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account has been deactivated');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Invalidate previous sessions (Single-Session enforcement)
    await this.prisma.deviceSession.updateMany({
      where: { userId: user.id, isActive: true },
      data: { isActive: false },
    });

    // Create new DeviceSession
    const isMobile = /mobile|android|iphone|ipad/i.test(userAgent);
    await this.prisma.deviceSession.create({
      data: {
        userId: user.id,
        token: accessToken,
        ipAddress: ip,
        userAgent,
        deviceType: isMobile ? 'Mobile' : 'Desktop',
        os: userAgent.includes('Windows') ? 'Windows' : userAgent.includes('Mac') ? 'macOS' : 'Linux',
        browser: userAgent.includes('Chrome') ? 'Chrome' : userAgent.includes('Firefox') ? 'Firefox' : 'Safari',
        isActive: true,
      },
    });

    // Store token for single-session enforcement
    await this.prisma.user.update({
      where: { id: user.id },
      data: { currentToken: accessToken },
    });

    // Log successful login
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        ipAddress: ip,
        userAgent,
        details: `Successful login from ${isMobile ? 'Mobile' : 'Desktop'} browser.`,
      },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  async logout(userId: string, token?: string) {
    if (token) {
      await this.prisma.deviceSession.updateMany({
        where: { userId, token },
        data: { isActive: false },
      });
    } else {
      await this.prisma.deviceSession.updateMany({
        where: { userId },
        data: { isActive: false },
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { currentToken: null },
    });

    // Log logout
    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'LEAVE_CLASS', // Maps to session termination audit
        ipAddress: '127.0.0.1',
        userAgent: 'unknown',
        details: 'User logged out manually.',
      },
    });

    return { message: 'Logged out successfully' };
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        admissions: {
          select: {
            id: true,
            fullName: true,
            cnic: true,
            whatsapp: true,
            postalAddress: true,
            lastQualification: true,
            selectedCourses: true,
            status: true,
          },
        },
        enrollments: {
          select: {
            id: true,
            batchName: true,
            batchId: true,
            isActive: true,
            startDate: true,
            endDate: true,
            batch: {
              select: {
                name: true,
                status: true,
              },
            },
            course: {
              select: {
                id: true,
                name: true,
                thumbnail: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword, currentToken: null },
    });

    return { message: 'Password changed successfully. Please login again.' };
  }

  async register(name: string, email: string, password: string) {
    const normalizedEmail = email.toLowerCase();

    // Check if user already exists
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('An account with this email already exists. Please sign in.');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name,
        role: 'student',
        password: hashedPassword,
        isActive: true,
      },
    });

    // Auto-login: generate JWT
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = this.jwtService.sign(payload);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { currentToken: accessToken },
    });

    return {
      accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }
}
