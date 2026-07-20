import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class BbbService {
  private readonly logger = new Logger(BbbService.name);
  private readonly bbbUrl: string;
  private readonly bbbSecret: string;

  constructor(private readonly configService: ConfigService) {
    this.bbbUrl = this.configService.get<string>(
      'BBB_URL',
      'https://test-install.blindsidenetworks.com/bigbluebutton/api',
    );
    this.bbbSecret = this.configService.get<string>(
      'BBB_SECRET',
      '8cd8ef52e8e101574e400365b55e11a6',
    );
  }

  /**
   * Calculates the SHA-1 checksum required by BigBlueButton API.
   * Format: sha1(apiMethodName + queryString + secret)
   */
  private calculateChecksum(callName: string, queryString: string): string {
    return crypto
      .createHash('sha1')
      .update(callName + queryString + this.bbbSecret)
      .digest('hex');
  }

  /**
   * Creates a meeting in BBB if it doesn't already exist.
   * Enforces server-side locks and safety options.
   */
  async createMeeting(params: {
    meetingID: string;
    name: string;
    moderatorPW: string;
    attendeePW: string;
    allowStudentMic: boolean;
    allowStudentCamera: boolean;
    allowStudentScreenshare: boolean;
  }): Promise<boolean> {
    const queryParams = {
      meetingID: params.meetingID,
      name: params.name,
      moderatorPW: params.moderatorPW,
      attendeePW: params.attendeePW,
      record: 'true',
      muteOnStart: 'true', // Mute all students on start
      lockSettingsLockOnJoin: 'true', // Enable locks when users join
      lockSettingsLockOnJoinConfigurable: 'true', // Moderator can configure/change locks
      lockSettingsDisableMic: params.allowStudentMic ? 'false' : 'true',
      lockSettingsDisableCam: params.allowStudentCamera ? 'false' : 'true',
      lockSettingsDisableScreenshare: params.allowStudentScreenshare ? 'false' : 'true',
      lockSettingsDisablePrivateChat: 'true', // Prevent private student chat
      lockSettingsDisableNote: 'true', // Prevent shared note edits
      lockSettingsHideUserList: 'true', // Hides user list for student privacy
    };

    const queryString = new URLSearchParams(queryParams).toString();
    const checksum = this.calculateChecksum('create', queryString);
    const url = `${this.bbbUrl}/create?${queryString}&checksum=${checksum}`;

    try {
      const response = await fetch(url);
      const xmlText = await response.text();
      if (xmlText.includes('<returncode>SUCCESS</returncode>')) {
        this.logger.log(`BBB meeting ${params.meetingID} created successfully or already exists.`);
        return true;
      } else {
        this.logger.error(`Failed to create BBB meeting. URL: ${url}. Response: ${xmlText}`);
        return false;
      }
    } catch (error: any) {
      this.logger.error(`Error calling BBB create API: ${error.message}`);
      return false;
    }
  }

  /**
   * Generates a join URL for a BBB meeting.
   */
  generateJoinUrl(params: {
    meetingID: string;
    fullName: string;
    password: string;
  }): string {
    const queryParams = {
      meetingID: params.meetingID,
      fullName: params.fullName,
      password: params.password,
      redirect: 'true',
    };

    const queryString = new URLSearchParams(queryParams).toString();
    const checksum = this.calculateChecksum('join', queryString);
    return `${this.bbbUrl}/join?${queryString}&checksum=${checksum}`;
  }
}
