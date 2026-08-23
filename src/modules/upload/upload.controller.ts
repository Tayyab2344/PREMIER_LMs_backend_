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
import { extname, join, basename } from 'path';
import { existsSync, mkdirSync, promises as fsPromises } from 'fs';
import { tmpdir } from 'os';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { CloudinaryService } from './cloudinary.service';

const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.pdf'];
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Sniffs the magic bytes / file signature directly from the buffer.
 * Enforces that file contents match genuine JPG, PNG, WEBP, or PDF signatures.
 */
function detectMagicBytes(buffer: Buffer): { ext: string; mime: string } | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { ext: '.jpg', mime: 'image/jpeg' };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { ext: '.png', mime: 'image/png' };
  }

  // PDF: 25 50 44 46 (%PDF)
  if (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { ext: '.pdf', mime: 'application/pdf' };
  }

  // WEBP: RIFF (bytes 0..3) and WEBP (bytes 8..11)
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return { ext: '.webp', mime: 'image/webp' };
  }

  return null;
}

@Controller('uploads')
export class UploadController {
  constructor(
    private readonly configService: ConfigService,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  @Post()
  @Throttle({ short: { limit: 5, ttl: 60000 } }) // Rate limit: 5 uploads per minute
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_SIZE },
      fileFilter: (req, file, cb) => {
        const fileExt = extname(file.originalname || '').toLowerCase();
        if (ALLOWED_EXTENSIONS.includes(fileExt)) {
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
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('No file provided or file is empty.');
    }

    const fileExt = extname(file.originalname || '').toLowerCase();
    
    // 1. Strict AND Validation: Extension check AND Magic Bytes check
    const detected = detectMagicBytes(file.buffer);
    if (!detected) {
      throw new BadRequestException(
        'File signature verification failed. Only valid JPG, PNG, WEBP, and PDF files are permitted.',
      );
    }

    // Ensure detected extension is compatible with the file extension
    const isImageCompatible =
      (detected.ext === '.jpg' && (fileExt === '.jpg' || fileExt === '.jpeg')) ||
      (detected.ext === '.png' && fileExt === '.png') ||
      (detected.ext === '.webp' && fileExt === '.webp') ||
      (detected.ext === '.pdf' && fileExt === '.pdf');

    if (!isImageCompatible) {
      throw new BadRequestException(
        'File extension does not match true binary content format.',
      );
    }

    // 2. Sanitize original name (strip path characters & control characters)
    const rawOriginalName = basename(file.originalname || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_');
    const uniqueName = `${uuidv4()}${detected.ext}`;

    // 3. Try Cloudinary stream upload if configured
    if (this.cloudinaryService.isConfigured) {
      try {
        const cloudinaryUrl = await this.cloudinaryService.uploadBuffer(
          file.buffer,
          detected.mime,
        );
        if (cloudinaryUrl) {
          return {
            filename: cloudinaryUrl,
            originalName: rawOriginalName,
            size: file.size,
            url: cloudinaryUrl,
          };
        }
      } catch (error: any) {
        console.warn(`Cloudinary upload failed, falling back to temp file storage: ${error.message || error}`);
      }
    }

    // 4. Fallback: Save to OS temp directory (/tmp) which is writable on Serverless environments
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
        originalName: rawOriginalName,
        size: file.size,
        url: localUrl,
      };
    } catch (err: any) {
      // Direct Data URI fallback if file write fails completely
      const b64 = file.buffer.toString('base64');
      const dataUri = `data:${detected.mime};base64,${b64}`;
      return {
        filename: uniqueName,
        originalName: rawOriginalName,
        size: file.size,
        url: dataUri,
      };
    }
  }

  @Get(':filename')
  serveFile(@Param('filename') filename: string, @Res() res: Response) {
    // 1. Strict filename format validation (UUID + allowed extension only)
    const sanitizedFilename = basename(filename);
    const validFilenamePattern = /^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|pdf)$/i;

    if (!validFilenamePattern.test(sanitizedFilename)) {
      throw new BadRequestException('Invalid or malformed filename.');
    }

    const fileExt = extname(sanitizedFilename).toLowerCase();
    const contentType = MIME_BY_EXT[fileExt] || 'application/octet-stream';

    // 2. Set Defensive HTTP Security Headers to prevent XSS / MIME-sniffing
    res.setHeader('Content-Type', contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('Content-Disposition', `inline; filename="${sanitizedFilename}"`);

    // 3. Check OS temp dir (/tmp/premier_uploads)
    const tempFilePath = join(tmpdir(), 'premier_uploads', sanitizedFilename);
    if (existsSync(tempFilePath)) {
      return res.sendFile(tempFilePath);
    }

    // 4. Check configured UPLOAD_DIR
    const uploadDir = this.configService.get<string>('UPLOAD_DIR', './uploads');
    const localFilePath = join(process.cwd(), uploadDir, sanitizedFilename);
    if (existsSync(localFilePath)) {
      return res.sendFile(localFilePath);
    }

    throw new BadRequestException('File not found');
  }
}
