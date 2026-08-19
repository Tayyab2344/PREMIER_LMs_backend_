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
import { diskStorage } from 'multer';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { extname, join } from 'path';
import { existsSync, mkdirSync, promises as fsPromises } from 'fs';
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
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadDir = process.env.UPLOAD_DIR || './uploads';
          const fullPath = join(process.cwd(), uploadDir);
          if (!existsSync(fullPath)) {
            mkdirSync(fullPath, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (req, file, cb) => {
          const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
          cb(null, uniqueName);
        },
      }),
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
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    let url = `/api/uploads/${file.filename}`;
    let filename = file.filename;

    const isImage = file.mimetype.startsWith('image/');

    if (isImage) {
      try {
        const cloudinaryUrl = await this.cloudinaryService.uploadFile(file.path);
        if (cloudinaryUrl) {
          url = cloudinaryUrl;
          filename = cloudinaryUrl;

          // Clean up local temp file if Cloudinary upload succeeded
          if (existsSync(file.path)) {
            await fsPromises.unlink(file.path).catch(() => {});
          }
        }
      } catch (error: any) {
        console.warn(`Cloudinary upload failed, falling back to local storage: ${error.message || error}`);
        // Fallback: retain local file and serve via local endpoint
        url = `/api/uploads/${file.filename}`;
        filename = file.filename;
      }
    }

    return {
      filename,
      originalName: file.originalname,
      size: file.size,
      url,
    };
  }

  @Get(':filename')
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    const uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
    const filePath = join(process.cwd(), uploadDir, filename);

    // Security: prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      throw new BadRequestException('Invalid filename');
    }

    if (!existsSync(filePath)) {
      throw new BadRequestException('File not found');
    }

    res.sendFile(filePath);
  }
}

