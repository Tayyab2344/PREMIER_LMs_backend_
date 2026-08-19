import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  public readonly isConfigured: boolean = false;

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    if (cloudName && apiKey && apiSecret && !cloudName.includes('your_')) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.isConfigured = true;
      this.logger.log('Cloudinary configured successfully via credentials.');
    } else {
      const cloudinaryUrl = this.configService.get<string>('CLOUDINARY_URL');
      if (cloudinaryUrl) {
        cloudinary.config();
        this.isConfigured = true;
        this.logger.log('Cloudinary configured via CLOUDINARY_URL.');
      } else {
        this.isConfigured = false;
        this.logger.warn('Cloudinary disabled (credentials missing). Fast local storage active.');
      }
    }
  }

  async uploadFile(filePath: string): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('Cloudinary not configured');
    }
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

  async uploadBuffer(buffer: Buffer, mimetype: string): Promise<string> {
    if (!this.isConfigured) {
      throw new Error('Cloudinary not configured');
    }

    const uploadPromise = new Promise<string>((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'premier_lms_uploads',
          resource_type: 'auto',
        },
        (error, result) => {
          if (error) {
            this.logger.error(`Cloudinary stream upload failed: ${error.message || error}`);
            return reject(error);
          }
          if (!result || !result.secure_url) {
            return reject(new Error('Cloudinary returned no secure_url'));
          }
          resolve(result.secure_url);
        },
      );
      uploadStream.end(buffer);
    });

    const timeoutPromise = new Promise<string>((_, reject) =>
      setTimeout(() => reject(new Error('Cloudinary upload timeout after 4s')), 4000)
    );

    return Promise.race([uploadPromise, timeoutPromise]);
  }
}
