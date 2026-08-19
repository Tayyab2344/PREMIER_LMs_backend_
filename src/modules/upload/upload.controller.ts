import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { extname, join } from 'path';
import { existsSync, mkdirSync, promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService } from './cloudinary.service';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

@Controller('uploads')
export class UploadController {
  constructor(
    private readonly configService: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (req, file, cb) => {
        const fileExt = extname(file.originalname).toLowerCase();
        const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];

        if (ALLOWED_TYPES.includes(file.mimetype) || allowedExts.includes(fileExt)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              'Only JPG, PNG, WEBP and PDF files are allowed',
            ),
            false,
          );
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file || !file.buffer) {
      throw new BadRequestException('No file provided');
    }

    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;

    // Try Cloudinary stream upload if configured
    if (this.cloudinaryService.isConfigured) {
      try {
        const cloudinaryUrl = await this.cloudinaryService.uploadBuffer(
          file.buffer,
          file.mimetype,
        );
        if (cloudinaryUrl) {
          return {
            filename: cloudinaryUrl,
            originalName: file.originalname,
            size: file.size,
            url: cloudinaryUrl,
          };
        }
      } catch (error: any) {
        console.warn(`Cloudinary upload failed, falling back to temp file storage: ${error.message || error}`);
      }
    }

    // Fallback: Save to OS temp directory (/tmp) which is writable on Serverless environments
    try {
      const tempDir = join(tmpdir(), 'premier_uploads');
      if (!existsSync(tempDir)) {
        mkdirSync(tempDir, { recursive: true });
      }
      const tempFilePath = join(tempDir, uniqueName);
      await fsPromises.writeFile(tempFilePath, file.buffer);

      const localUrl = `/api/uploads/${uniqueName}`;
      return {
        filename: uniqueName,
        originalName: file.originalname,
        size: file.size,
        url: localUrl,
      };
    } catch (err: any) {
      // Direct Data URI fallback if file write fails completely
      const b64 = file.buffer.toString('base64');
      const dataUri = `data:${file.mimetype};base64,${b64}`;
      return {
        filename: uniqueName,
        originalName: file.originalname,
        size: file.size,
        url: dataUri,
      };
    }
  }

  @Get(':filename')
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    // Security check
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename');
    }

    // 1. Check OS temp dir (/tmp/premier_uploads)
    const tempFilePath = join(tmpdir(), 'premier_uploads', filename);
    if (existsSync(tempFilePath)) {
      return res.sendFile(tempFilePath);
    }

    // 2. Check configured UPLOAD_DIR
    const uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
    const localFilePath = join(process.cwd(), uploadDir, filename);
    if (existsSync(localFilePath)) {
      return res.sendFile(localFilePath);
    }

    throw new BadRequestException('File not found');
  }
}

