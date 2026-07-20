import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JitsiService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly domain: string;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.appId = this.configService.get<string>('JITSI_APP_ID', 'premier_lms');
    this.appSecret = this.configService.get<string>('JITSI_APP_SECRET', '');
    this.domain = this.configService.get<string>('JITSI_DOMAIN', 'meet.yourdomain.com');
  }

  generateToken(params: {
    roomName: string;
    userName: string;
    userEmail: string;
    isModerator: boolean;
    allowScreenshare?: boolean;
    expiresAt?: Date;
  }) {
    const now = Math.floor(Date.now() / 1000);
    const exp = params.expiresAt
      ? Math.floor(params.expiresAt.getTime() / 1000)
      : now + 3600; // Default 1 hour
 
    const payload = {
      aud: 'jitsi',
      iss: this.appId,
      sub: this.domain,
      room: params.roomName,
      context: {
        user: {
          name: params.userName,
          email: params.userEmail,
          moderator: params.isModerator,
        },
        features: {
          recording: params.isModerator,
          livestreaming: params.isModerator,
          'screen-sharing': params.allowScreenshare !== undefined ? params.allowScreenshare : true,
        },
      },
      exp,
      iat: now,
      nbf: now - 10,
    };
 
    return {
      jwt: this.jwtService.sign(payload, {
        secret: this.appSecret,
        algorithm: 'HS256' as any,
      }),
      domain: this.domain,
      roomName: params.roomName,
    };
  }
}
