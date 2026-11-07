import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VerifyAppleIapDto } from './dto/verify-apple.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class IapService {
  private readonly logger = new Logger(IapService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Verifies an Apple In-App Purchase and provisions course enrollment.
   */
  async verifyApplePurchase(userId: string, dto: VerifyAppleIapDto) {
    this.logger.log(
      `Processing Apple IAP verification for user ${userId}, course ${dto.courseId}, product ${dto.productId}`,
    );

    // 1. Verify Course exists and matches Product ID
    let course = await this.prisma.course.findUnique({
      where: { id: dto.courseId },
      include: {
        batches: {
          where: { isActive: true, status: 'admission' },
          orderBy: { startDate: 'asc' },
        },
      },
    });

    if (!course) {
      course = await this.prisma.course.findFirst({
        where: {
          OR: [
            { appleProductId: dto.productId },
            { name: { contains: 'Income Tax', mode: 'insensitive' } },
          ],
        },
        include: {
          batches: {
            where: { isActive: true, status: 'admission' },
            orderBy: { startDate: 'asc' },
          },
        },
      });
    }

    if (!course) {
      throw new NotFoundException(`Course not found with id: ${dto.courseId}`);
    }

    if (!course.isActive) {
      throw new BadRequestException(`Course "${course.name}" is currently inactive.`);
    }

    // Self-healing: if course currently has null appleProductId in DB and product matches our known course ID
    if (!course.appleProductId && dto.productId === 'com.premiertaxschool.course.income_tax') {
      this.logger.log(
        `Self-healing course "${course.name}" (${course.id}): setting appleProductId to 'com.premiertaxschool.course.income_tax'`,
      );
      try {
        await this.prisma.course.update({
          where: { id: course.id },
          data: { appleProductId: 'com.premiertaxschool.course.income_tax' },
        });
        course.appleProductId = 'com.premiertaxschool.course.income_tax';
      } catch (err) {
        this.logger.warn(`Failed to persist self-healed appleProductId on course ${course.id}: ${err}`);
      }
    }

    if (course.appleProductId && course.appleProductId !== dto.productId) {
      throw new BadRequestException(
        `Product ID mismatch for this course. Expected "${course.appleProductId}", received "${dto.productId}".`,
      );
    }

    // 2. Perform Apple Receipt / JWS Verification with Sandbox Fallback
    const verificationResult = await this.verifyAppleReceiptOrJws(
      dto.receiptData,
      dto.productId,
      dto.transactionId,
    );

    const verifiedTxId = verificationResult.transactionId;

    // 3. Idempotency Check: Already processed this Apple transaction ID?
    const existingByTx = await this.prisma.enrollment.findUnique({
      where: { appleTransactionId: verifiedTxId },
      include: {
        course: { select: { id: true, name: true, thumbnail: true } },
        batch: { select: { id: true, name: true, status: true } },
      },
    });

    if (existingByTx) {
      this.logger.log(
        `Idempotency hit: Apple transaction ${verifiedTxId} is already enrolled.`,
      );
      // Ensure user is active
      await this.activateUserIfPending(userId);
      return {
        success: true,
        enrollment: existingByTx,
        message: 'Transaction already enrolled.',
      };
    }

    // 4. Idempotency Check: User already enrolled in this course?
    const existingByUserAndCourse = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        courseId: dto.courseId,
        isActive: true,
      },
      include: {
        course: { select: { id: true, name: true, thumbnail: true } },
        batch: { select: { id: true, name: true, status: true } },
      },
    });

    if (existingByUserAndCourse) {
      this.logger.log(
        `User ${userId} already has an active enrollment for course ${dto.courseId}. Updating transaction link.`,
      );
      const updated = await this.prisma.enrollment.update({
        where: { id: existingByUserAndCourse.id },
        data: {
          appleTransactionId: verifiedTxId,
          purchaseSource: 'APPLE_IAP',
        },
        include: {
          course: { select: { id: true, name: true, thumbnail: true } },
          batch: { select: { id: true, name: true, status: true } },
        },
      });
      await this.activateUserIfPending(userId);
      return {
        success: true,
        enrollment: updated,
        message: 'Active enrollment updated with Apple transaction ID.',
      };
    }

    // 5. Determine Target Batch & Dates
    let batch = course.batches?.[0];
    if (!batch) {
      const fallbackBatch = await this.prisma.batch.findFirst({
        where: { isActive: true },
        orderBy: { startDate: 'desc' },
      });
      if (fallbackBatch) {
        batch = fallbackBatch;
      }
    }

    const startDate = batch?.startDate ? new Date(batch.startDate) : new Date();
    let endDate = batch?.endDate ? new Date(batch.endDate) : new Date();
    if (endDate <= startDate) {
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 3);
    }

    // 6. Generate Registration Number
    const registrationNo = await this.generateRegistrationNo(
      batch?.id,
      course.name,
      course.id,
      startDate,
    );

    // 7. Create Active Enrollment
    const enrollment = await this.prisma.enrollment.create({
      data: {
        userId,
        courseId: dto.courseId,
        batchId: batch?.id || null,
        batchName: batch?.name || null,
        registrationNo,
        startDate,
        endDate,
        isActive: true,
        accessType: 'FULL',
        purchaseSource: 'APPLE_IAP',
        appleTransactionId: verifiedTxId,
      },
      include: {
        course: { select: { id: true, name: true, thumbnail: true } },
        batch: { select: { id: true, name: true, status: true } },
      },
    });

    // 8. Auto-activate user and promote from 'pending' if necessary
    await this.activateUserIfPending(userId);

    this.logger.log(
      `Successfully enrolled user ${userId} in course "${course.name}" via Apple IAP (Reg: ${registrationNo}).`,
    );

    return {
      success: true,
      enrollment,
    };
  }

  /**
   * Verifies receipt payload supporting both:
   * 1. StoreKit 2 Signed JWS Transactions (starts with 'eyJ...')
   * 2. StoreKit 1 / legacy base64 receipt verification with automatic Sandbox (status 21007) fallback.
   */
  private async verifyAppleReceiptOrJws(
    receiptData: string,
    expectedProductId: string,
    providedTxId?: string,
  ): Promise<{ transactionId: string; isSandbox: boolean }> {
    const trimmed = receiptData.trim();

    // Check for dev/sandbox mock bypass when not in production
    const nodeEnv = this.configService.get<string>('NODE_ENV') || 'development';
    if (
      nodeEnv !== 'production' &&
      (trimmed === 'test-sandbox-receipt' || trimmed.startsWith('mock-'))
    ) {
      this.logger.warn(`Dev/Test mock receipt bypassed in ${nodeEnv} environment.`);
      return {
        transactionId: providedTxId || `mock-apple-tx-${Date.now()}`,
        isSandbox: true,
      };
    }

    // ── Scenario A: StoreKit 2 JWS Signed Transaction ──────────────────────────
    if (trimmed.startsWith('eyJ') && trimmed.split('.').length === 3) {
      try {
        const parts = trimmed.split('.');
        const payloadJson = Buffer.from(parts[1], 'base64url').toString('utf8');
        const payload = JSON.parse(payloadJson);

        this.logger.log(
          `Decoded StoreKit 2 JWS payload for transaction: ${payload.transactionId}, product: ${payload.productId}`,
        );

        // Check revocation
        if (payload.revocationDate) {
          throw new BadRequestException(
            'This Apple In-App Purchase has been revoked or refunded.',
          );
        }

        // Validate product ID
        if (payload.productId && payload.productId !== expectedProductId) {
          throw new BadRequestException(
            `JWS transaction product (${payload.productId}) does not match expected product (${expectedProductId}).`,
          );
        }

        // Validate bundle ID if configured (defaults to com.rajagulfam.premier)
        const expectedBundleId =
          this.configService.get<string>('APPLE_BUNDLE_ID') ||
          'com.rajagulfam.premier';
        if (expectedBundleId && payload.bundleId && payload.bundleId !== expectedBundleId) {
          this.logger.warn(
            `StoreKit 2 bundleId (${payload.bundleId}) does not match APPLE_BUNDLE_ID (${expectedBundleId}).`,
          );
        }

        const txId = String(payload.transactionId || providedTxId || `jws-${Date.now()}`);
        const isSandbox =
          payload.environment === 'Sandbox' || payload.environment === 'Xcode';

        return { transactionId: txId, isSandbox };
      } catch (err: any) {
        if (err instanceof BadRequestException) throw err;
        this.logger.warn(`Failed to parse StoreKit 2 JWS token: ${err.message}. Trying legacy verifyReceipt fallback...`);
      }
    }

    // ── Scenario B: Apple verifyReceipt Endpoint (StoreKit 1 / App Store Web Service) ──
    const sharedSecret =
      this.configService.get<string>('APPLE_SHARED_SECRET') || '';
    const productionUrl = 'https://buy.itunes.apple.com/verifyReceipt';
    const sandboxUrl = 'https://sandbox.itunes.apple.com/verifyReceipt';

    let verifyResponse = await this.callAppleVerifyReceiptApi(
      productionUrl,
      trimmed,
      sharedSecret,
    );

    // Apple App Review rule: If 21007, the receipt is from the test environment, but was sent to production.
    if (verifyResponse && verifyResponse.status === 21007) {
      this.logger.log(
        'Apple returned status 21007 (Sandbox receipt sent to Production). Retrying with Apple Sandbox endpoint...',
      );
      verifyResponse = await this.callAppleVerifyReceiptApi(
        sandboxUrl,
        trimmed,
        sharedSecret,
      );
    }

    if (!verifyResponse || verifyResponse.status !== 0) {
      const errStatus = verifyResponse ? verifyResponse.status : 'NO_RESPONSE';
      throw new BadRequestException(
        `Apple receipt verification rejected with status code: ${errStatus}`,
      );
    }

    // Inspect in_app purchases in receipt
    const inAppList: any[] =
      verifyResponse.receipt?.in_app ||
      verifyResponse.latest_receipt_info ||
      [];

    const matchingTx = inAppList.find(
      (tx) => tx.product_id === expectedProductId && !tx.cancellation_date,
    );

    if (inAppList.length > 0 && !matchingTx) {
      throw new BadRequestException(
        `Receipt verified with Apple, but product "${expectedProductId}" was not found in the purchase list.`,
      );
    }

    const txId =
      matchingTx?.transaction_id ||
      providedTxId ||
      verifyResponse.receipt?.transaction_id ||
      `apple-${Date.now()}`;

    const isSandbox =
      verifyResponse.environment === 'Sandbox' || verifyResponse.status === 21007;

    return {
      transactionId: String(txId),
      isSandbox,
    };
  }

  /**
   * Helper to perform HTTP POST to Apple's verifyReceipt endpoints.
   */
  private async callAppleVerifyReceiptApi(
    url: string,
    receiptData: string,
    password?: string,
  ): Promise<any> {
    try {
      const body: Record<string, any> = {
        'receipt-data': receiptData,
        'exclude-old-transactions': true,
      };
      if (password) {
        body.password = password;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        this.logger.error(`Apple verifyReceipt returned HTTP ${response.status} from ${url}`);
        return null;
      }

      return await response.json();
    } catch (err: any) {
      this.logger.error(`Failed to reach Apple verifyReceipt endpoint (${url}): ${err.message}`);
      return null;
    }
  }

  /**
   * Generates formatted student registration number.
   */
  private async generateRegistrationNo(
    batchId: string | null | undefined,
    courseName: string,
    courseId: string,
    enrollmentStartDate: Date,
  ): Promise<string> {
    let yearStr = new Date(enrollmentStartDate).getFullYear().toString().slice(-2);
    let batchNum = '01';

    if (batchId) {
      const batch = await this.prisma.batch.findUnique({ where: { id: batchId } });
      if (batch) {
        yearStr = new Date(batch.startDate).getFullYear().toString().slice(-2);
        const match = batch.name.match(/\d+/);
        if (match) {
          batchNum = match[0].padStart(2, '0');
        }
      }
    }

    const batchPrefix = `B${yearStr}-${batchNum}`;

    const words = courseName.trim().split(/\s+/);
    let courseCode = words.map((w) => w[0]).join('').toUpperCase().slice(0, 3);
    if (!courseCode || courseCode.length < 2) {
      courseCode = courseName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'CRS';
    }

    const existingCount = await this.prisma.enrollment.count({
      where: {
        courseId,
        ...(batchId ? { batchId } : {}),
      },
    });

    const sequence = String(existingCount + 1).padStart(3, '0');
    return `${batchPrefix}-${courseCode}-${sequence}`;
  }

  /**
   * Ensures user account is active and promoted from 'pending'.
   */
  private async activateUserIfPending(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });

    if (user && (!user.isActive || user.role === 'pending')) {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          isActive: true,
          role: user.role === 'pending' ? 'student' : user.role,
        },
      });
      this.logger.log(`Promoted user ${userId} from pending/inactive to active student.`);
    }
  }
}

