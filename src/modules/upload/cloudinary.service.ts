import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.logger.log('Cloudinary configured successfully via credentials.');
    } else {
      const cloudinaryUrl = this.configService.get<string>('CLOUDINARY_URL');
      if (cloudinaryUrl) {
        cloudinary.config();
        this.logger.log('Cloudinary configured via CLOUDINARY_URL.');
      } else {
        this.logger.warn('Cloudinary credentials or CLOUDINARY_URL not found in configuration!');
      }
    }
  }

  async uploadFile(filePath: string): Promise<string> {
    try {
      const result = await cloudinary.uploader.upload(filePath, {
        folder: 'premier_lms_banners',
        resource_type: 'auto',
      });
      return result.secure_url;
    } catch (error: any) {
      this.logger.error(`Cloudinary upload failed: ${error.message || error}`);
      throw error;
    }
  }
}
