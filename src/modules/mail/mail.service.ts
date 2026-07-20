import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '465', 10);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: user && pass ? { user, pass } : undefined,
    });

    // Verify SMTP connection on startup
    if (user && pass) {
      this.transporter.verify((error) => {
        if (error) {
          this.logger.error(
            `SMTP server connection verification failed for user "${user}". Please check SMTP configurations:`,
            error,
          );
        } else {
          this.logger.log('SMTP connection successfully verified. Ready to send emails.');
        }
      });
    } else {
      this.logger.warn('SMTP credentials are missing. Emails will fail to send.');
    }
  }

  private async sendMail(to: string, subject: string, htmlContent: string) {
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      this.logger.warn(`Skipping email dispatch: recipient address "${to}" is invalid or blank.`);
      return;
    }

    const from = process.env.SMTP_FROM || '"Premier Academy" <tayyabatiq300@gmail.com>';
    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        html: htmlContent,
      });
      this.logger.log(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
    }
  }

  // Common wrapper styling for professional templates
  private getEmailWrapper(title: string, bodyHtml: string): string {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${title}</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f3f4f6;
            margin: 0;
            padding: 0;
            -webkit-font-smoothing: antialiased;
          }
          .email-container {
            max-width: 600px;
            margin: 40px auto;
            background: #ffffff;
            border-radius: 16px;
            overflow: hidden;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
            border: 1px solid #e5e7eb;
          }
          .email-header {
            background-color: #1e3a8a;
            background-image: linear-gradient(135deg, #1e3a8a 0%, #0f172a 100%);
            padding: 32px;
            text-align: center;
          }
          .email-header h1 {
            color: #ffffff;
            margin: 0;
            font-size: 24px;
            font-weight: 800;
            letter-spacing: -0.5px;
          }
          .email-header p {
            color: #93c5fd;
            margin: 8px 0 0 0;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            font-weight: 600;
          }
          .email-body {
            padding: 40px 32px;
            color: #374151;
            line-height: 1.6;
          }
          .email-body h2 {
            font-size: 20px;
            color: #111827;
            margin-top: 0;
            font-weight: 700;
          }
          .email-body p {
            margin-top: 0;
            margin-bottom: 16px;
          }
          .email-footer {
            background-color: #f9fafb;
            padding: 24px 32px;
            text-align: center;
            border-top: 1px solid #f3f4f6;
            font-size: 12px;
            color: #6b7280;
          }
          .email-footer a {
            color: #2563eb;
            text-decoration: none;
            font-weight: 500;
          }
          .btn-primary {
            display: inline-block;
            background-color: #10b981;
            color: #ffffff !important;
            text-decoration: none;
            padding: 12px 28px;
            font-weight: 700;
            border-radius: 8px;
            margin-top: 24px;
            font-size: 14px;
            text-align: center;
            transition: background-color 0.2s;
          }
          .status-badge {
            display: inline-block;
            padding: 6px 14px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 20px;
          }
          .status-approved {
            background-color: #d1fae5;
            color: #065f46;
          }
          .status-pending {
            background-color: #dbeafe;
            color: #1e40af;
          }
          .status-rejected {
            background-color: #fee2e2;
            color: #991b1b;
          }
          .info-list {
            background-color: #f9fafb;
            border-radius: 10px;
            padding: 20px;
            margin: 20px 0;
            border: 1px solid #f3f4f6;
            list-style: none;
          }
          .info-list li {
            margin-bottom: 12px;
            font-size: 14px;
          }
          .info-list li:last-child {
            margin-bottom: 0;
          }
          .info-list strong {
            color: #111827;
          }
        </style>
      </head>
      <body>
        <div class="email-container">
          <div class="email-header">
            <h1>Premier Academy</h1>
            <p>Tax & Accounting School</p>
          </div>
          <div class="email-body">
            ${bodyHtml}
          </div>
          <div class="email-footer">
            <p>&copy; ${new Date().getFullYear()} Premier LMS. All rights reserved.</p>
            <p>Need support? Visit our website at <a href="${appUrl}">${appUrl.replace(/https?:\/\//, '')}</a></p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  async sendAdmissionReceived(to: string, studentName: string, courses: string[]) {
    const courseList = Array.isArray(courses) ? courses : [];
    const html = this.getEmailWrapper(
      'Admission Application Received',
      `
        <h2>Dear ${studentName || 'Student'},</h2>
        <div class="status-badge status-pending">Application Received</div>
        <p>Thank you for submitting your admission application to Premier Academy! We have successfully received your form and our admissions committee is currently reviewing it.</p>
        
        <p><strong>Selected Courses:</strong></p>
        <ul style="padding-left: 20px; margin: 12px 0; font-size: 14px; color: #4b5563;">
          ${courseList.map(c => `<li>${c}</li>`).join('')}
        </ul>

        <p>A representative will review your credentials and get back to you shortly. You will receive an email containing your status updates and portal login credentials once approved.</p>
        <p>Best regards,<br>Admissions Board<br><strong>Premier Academy</strong></p>
      `
    );

    return this.sendMail(to, 'Admission Application Received - Premier Academy', html);
  }

  async sendAdmissionApproved(to: string, studentName: string, loginPassword?: string) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    
    let credentialsHtml = '';
    if (loginPassword) {
      credentialsHtml = `
        <p>A student account has been created for you. Please use the following details to log in to your dashboard:</p>
        <ul class="info-list">
          <li><strong>Portal URL:</strong> <a href="${appUrl}/auth/login" style="color: #2563eb; text-decoration: none;">${appUrl.replace(/https?:\/\//, '')}/auth/login</a></li>
          <li><strong>Email Address:</strong> ${to}</li>
          <li><strong>Temporary Password:</strong> <code style="font-family: monospace; font-size: 15px; color: #1e3a8a; background: #eff6ff; padding: 2px 6px; border-radius: 4px; font-weight: bold;">${loginPassword}</code></li>
        </ul>
        <p style="font-size: 12px; color: #6b7280; font-style: italic;">* Note: For security, we recommend changing your password from your dashboard settings page immediately after your first log in.</p>
      `;
    } else {
      credentialsHtml = `
        <p>Since you already have a registered account under this email address, you can access your enrolled courses directly by logging into your dashboard.</p>
        <ul class="info-list">
          <li><strong>Portal URL:</strong> <a href="${appUrl}/auth/login" style="color: #2563eb; text-decoration: none;">${appUrl.replace(/https?:\/\//, '')}/auth/login</a></li>
          <li><strong>Email Address:</strong> ${to}</li>
        </ul>
      `;
    }

    const html = this.getEmailWrapper(
      'Admission Approved',
      `
        <h2>Congratulations ${studentName || 'Student'}!</h2>
        <div class="status-badge status-approved">Admission Approved</div>
        <p>We are thrilled to inform you that your application for admission to Premier Academy has been approved. Welcome to our student cohort!</p>
        
        ${credentialsHtml}

        <div style="text-align: center; margin-top: 30px;">
          <a href="${appUrl}/auth/login" class="btn-primary">Access Student Portal</a>
        </div>

        <p style="margin-top: 30px;">If you have any questions or require support setting up your account, do not hesitate to contact our admissions officer.</p>
        <p>Welcome aboard!<br>Admissions Board<br><strong>Premier Academy</strong></p>
      `
    );

    return this.sendMail(to, 'Welcome to Premier Academy! - Admission Approved', html);
  }

  async sendAdmissionRejected(to: string, studentName: string, remarks?: string) {
    const remarksHtml = remarks 
      ? `<p><strong>Feedback / Reason:</strong></p>
         <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; color: #991b1b; padding: 16px; border-radius: 8px; font-size: 14px; margin: 16px 0;">
           ${remarks}
         </div>`
      : '';

    const html = this.getEmailWrapper(
      'Admission Application Status',
      `
        <h2>Dear ${studentName || 'Student'},</h2>
        <div class="status-badge status-rejected">Application Rejected</div>
        <p>Thank you for your interest in Premier Academy. Our admissions department has finished reviewing your application.</p>
        
        <p>Regretfully, we are unable to approve your application at this time.</p>
        
        ${remarksHtml}

        <p>If you have any questions or believe this is an error, please contact the admissions support desk.</p>
        <p>Best regards,<br>Admissions Board<br><strong>Premier Academy</strong></p>
      `
    );

    return this.sendMail(to, 'Admission Application Status - Premier Academy', html);
  }

  async sendClassScheduled(
    to: string, 
    studentName: string, 
    courseName: string, 
    classTitle: string, 
    scheduledStart: Date, 
    jitsiLink: string
  ) {
    let formattedDate = 'Scheduled Date';
    let formattedTime = 'Scheduled Time';
    try {
      if (scheduledStart) {
        const dObj = new Date(scheduledStart);
        if (!isNaN(dObj.getTime())) {
          formattedDate = dObj.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          });
          formattedTime = dObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZoneName: 'short',
          });
        }
      }
    } catch (e) {
      this.logger.error('Error formatting class start date:', e);
    }

    const html = this.getEmailWrapper(
      'New Live Class Scheduled',
      `
        <h2>Hello ${studentName || 'Student'},</h2>
        <p>A new live class has been scheduled for your course cohort. Please save the details below:</p>
        
        <ul class="info-list">
          <li><strong>Course Name:</strong> ${courseName}</li>
          <li><strong>Class Title:</strong> ${classTitle}</li>
          <li><strong>Date:</strong> ${formattedDate}</li>
          <li><strong>Time:</strong> ${formattedTime}</li>
        </ul>

        <p>To join the live interactive class, please click the button below at the scheduled time to enter the secure portal session:</p>

        <div style="text-align: center; margin-top: 30px;">
          <a href="${jitsiLink}" class="btn-primary" style="background-color: #2563eb;">Join Live Class Session</a>
        </div>

        <p style="margin-top: 30px; font-size: 12px; color: #6b7280; text-align: center;">
          Ensure your camera and microphone are configured correctly before joining.
        </p>
      `
    );

    return this.sendMail(to, `New Live Class: ${classTitle} - ${courseName}`, html);
  }
}
