import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor() {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const user = process.env.SMTP_USER || 'recyconnect5@gmail.com';
    const pass = process.env.SMTP_PASS || 'ppybbkuoryorlamd';

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    // Verify SMTP connection on startup
    if (user && pass) {
      this.transporter.verify((error: Error | null) => {
        if (error) {
          this.logger.error(
            `SMTP server connection verification failed for user "${user}" on ${host}:${port}:`,
            error,
          );
        } else {
          this.logger.log(`SMTP connection successfully verified on ${host}:${port}. Ready to send emails.`);
        }
      });
    } else {
      this.logger.warn('SMTP credentials are missing. Emails will fail to send.');
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();
  }

  public getAppUrl(): string {
    const rawUrl = process.env.APP_URL;
    if (rawUrl && !rawUrl.includes('localhost') && !rawUrl.includes('127.0.0.1')) {
      return rawUrl.replace(/\/$/, '');
    }
    return 'https://www.premiertaxschool.com';
  }

  private async sendMail(to: string, subject: string, htmlContent: string, customPlainText?: string) {
    if (!to || typeof to !== 'string' || !to.includes('@')) {
      this.logger.warn(`Skipping email dispatch: recipient address "${to}" is invalid or blank.`);
      return;
    }

    const senderEmail = process.env.SMTP_USER || 'recyconnect5@gmail.com';
    const from = process.env.SMTP_FROM || `Premier Academy <${senderEmail}>`;
    const plainText = customPlainText || this.stripHtml(htmlContent);

    try {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        text: plainText,
        html: htmlContent,
      });
      this.logger.log(`Email sent successfully to ${to}. Message ID: ${info.messageId}`);
      return info;
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      throw error;
    }
  }

  // Pure table-based layout with inlined CSS for maximum inbox deliverability
  private getEmailWrapper(title: string, bodyHtml: string): string {
    const appUrl = this.getAppUrl();
    const displayDomain = appUrl.replace(/^https?:\/\//, '');

    return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table border="0" cellpadding="0" cellspacing="0" width="100%" style="table-layout: fixed; background-color: #f3f4f6; padding: 30px 10px;">
    <tr>
      <td align="center">
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
          
          <!-- Header -->
          <tr>
            <td align="center" style="background-color: #1e3a8a; padding: 32px 24px;">
              <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.3px;">Premier Academy</h1>
              <p style="color: #93c5fd; margin: 6px 0 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 600;">Tax &amp; Accounting School</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 36px 32px; color: #374151; font-size: 15px; line-height: 1.6;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="background-color: #f9fafb; padding: 24px 32px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #6b7280; line-height: 1.5;">
              <p style="margin: 0 0 6px 0;">&copy; ${new Date().getFullYear()} Premier Academy. All rights reserved.</p>
              <p style="margin: 0;">Portal: <a href="${appUrl}" target="_blank" style="color: #2563eb; text-decoration: none;">${displayDomain}</a></p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  async sendAdmissionReceived(to: string, studentName: string, courses: string[]) {
    const appUrl = this.getAppUrl();
    const courseList = Array.isArray(courses) ? courses : [];

    const bodyHtml = `
      <h2 style="font-size: 19px; color: #111827; margin: 0 0 16px 0; font-weight: 700;">Dear ${studentName || 'Student'},</h2>
      <p style="margin: 0 0 16px 0; color: #374151;">Thank you for submitting your admission application to Premier Academy! We have successfully received your form and our admissions team is currently reviewing it.</p>
      
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #111827;">Selected Courses:</p>
      <ul style="padding-left: 20px; margin: 0 0 20px 0; font-size: 14px; color: #4b5563;">
        ${courseList.map(c => `<li style="margin-bottom: 4px;">${c}</li>`).join('')}
      </ul>

      <p style="margin: 0 0 24px 0; color: #374151;">Our admissions officer will review your application shortly. Once approved, you will receive an email containing your portal login credentials.</p>
      <p style="margin: 0; color: #475569; font-size: 14px;">Best regards,<br><strong>Admissions Board</strong><br>Premier Academy</p>
    `;

    const plainText = `Dear ${studentName || 'Student'},

Thank you for submitting your admission application to Premier Academy! We have successfully received your form and our admissions team is currently reviewing it.

Selected Courses:
${courseList.map(c => `- ${c}`).join('\n')}

Our admissions officer will review your application shortly. Once approved, you will receive an email containing your portal login credentials.

Best regards,
Admissions Board
Premier Academy
${appUrl}
`;

    const html = this.getEmailWrapper('Admission Application Received', bodyHtml);
    return this.sendMail(to, 'Premier Academy: Admission Application Received', html, plainText);
  }

  async sendAdmissionApproved(to: string, studentName: string, loginPassword?: string) {
    const appUrl = this.getAppUrl();
    const displayDomain = appUrl.replace(/^https?:\/\//, '');

    let credentialsHtml = '';
    let credentialsText = '';

    if (loginPassword) {
      credentialsHtml = `
        <p style="margin: 0 0 16px 0; color: #374151;">Your student portal account has been activated. Please use the following details to log in to your dashboard:</p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 16px 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; color: #334155;">
                <tr>
                  <td style="padding: 6px 0; font-weight: 600; width: 140px;">Portal Address:</td>
                  <td style="padding: 6px 0;"><a href="${appUrl}/auth/login" style="color: #2563eb; text-decoration: none; font-weight: 500;">${displayDomain}/auth/login</a></td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: 600;">Email:</td>
                  <td style="padding: 6px 0; font-family: monospace; font-size: 14px; color: #0f172a;">${to}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: 600;">Temporary Password:</td>
                  <td style="padding: 6px 0; font-family: monospace; font-size: 15px; font-weight: 700; color: #1e3a8a;">${loginPassword}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0 16px 0;">
          <tr>
            <td align="center">
              <a href="${appUrl}/auth/login" target="_blank" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 13px 32px; font-size: 14px; font-weight: 700; border-radius: 6px;">Sign In to Student Portal</a>
            </td>
          </tr>
        </table>

        <p style="font-size: 12px; color: #64748b; margin: 12px 0 24px 0; text-align: center;">For security, please update your password after your first login.</p>
      `;

      credentialsText = `
Your student portal account has been activated:
- Portal URL: ${appUrl}/auth/login
- Email: ${to}
- Temporary Password: ${loginPassword}

Sign in here: ${appUrl}/auth/login

For security, please update your password after your first login.
`;
    } else {
      credentialsHtml = `
        <p style="margin: 0 0 16px 0; color: #374151;">You can access your enrolled courses directly by logging into your student dashboard:</p>
        
        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0;">
          <tr>
            <td style="padding: 16px 20px;">
              <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; color: #334155;">
                <tr>
                  <td style="padding: 6px 0; font-weight: 600; width: 140px;">Portal Address:</td>
                  <td style="padding: 6px 0;"><a href="${appUrl}/auth/login" style="color: #2563eb; text-decoration: none; font-weight: 500;">${displayDomain}/auth/login</a></td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; font-weight: 600;">Email:</td>
                  <td style="padding: 6px 0; font-family: monospace; font-size: 14px; color: #0f172a;">${to}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>

        <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0 16px 0;">
          <tr>
            <td align="center">
              <a href="${appUrl}/auth/login" target="_blank" style="display: inline-block; background-color: #10b981; color: #ffffff; text-decoration: none; padding: 13px 32px; font-size: 14px; font-weight: 700; border-radius: 6px;">Sign In to Student Portal</a>
            </td>
          </tr>
        </table>
      `;

      credentialsText = `
You can access your enrolled courses directly by logging into your student dashboard:
- Portal URL: ${appUrl}/auth/login
- Email: ${to}

Sign in here: ${appUrl}/auth/login
`;
    }

    const bodyHtml = `
      <h2 style="font-size: 19px; color: #111827; margin: 0 0 16px 0; font-weight: 700;">Dear ${studentName || 'Student'},</h2>
      <p style="margin: 0 0 20px 0; color: #374151;">Congratulations! Your application for admission to Premier Academy has been approved. Welcome to our student cohort.</p>
      
      ${credentialsHtml}

      <p style="margin: 0; color: #475569; font-size: 14px;">Welcome aboard!<br><strong>Admissions Board</strong><br>Premier Academy</p>
    `;

    const plainText = `Dear ${studentName || 'Student'},

Congratulations! Your application for admission to Premier Academy has been approved. Welcome to our student cohort.
${credentialsText}
Welcome aboard!
Admissions Board
Premier Academy
${appUrl}
`;

    const html = this.getEmailWrapper('Admission Approved', bodyHtml);
    return this.sendMail(to, 'Premier Academy: Admission Approved & Portal Login Details', html, plainText);
  }

  async sendAdmissionRejected(to: string, studentName: string, remarks?: string) {
    const appUrl = this.getAppUrl();

    const remarksHtml = remarks 
      ? `<table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #fef2f2; border-left: 4px solid #ef4444; border-radius: 4px; margin: 16px 0;">
           <tr>
             <td style="padding: 14px 18px; color: #991b1b; font-size: 14px;">
               <strong>Feedback / Reason:</strong><br />${remarks}
             </td>
           </tr>
         </table>`
      : '';

    const bodyHtml = `
      <h2 style="font-size: 19px; color: #111827; margin: 0 0 16px 0; font-weight: 700;">Dear ${studentName || 'Student'},</h2>
      <p style="margin: 0 0 16px 0; color: #374151;">Thank you for your interest in Premier Academy. Our admissions department has reviewed your application.</p>
      
      <p style="margin: 0 0 16px 0; color: #374151;">Regretfully, we are unable to approve your application at this time.</p>
      
      ${remarksHtml}

      <p style="margin: 20px 0 0 0; color: #475569; font-size: 14px;">If you have any questions, please contact our admissions office.<br><br>Best regards,<br><strong>Admissions Board</strong><br>Premier Academy</p>
    `;

    const plainText = `Dear ${studentName || 'Student'},

Thank you for your interest in Premier Academy. Our admissions department has reviewed your application.

Regretfully, we are unable to approve your application at this time.
${remarks ? `\nFeedback / Reason: ${remarks}\n` : ''}
If you have any questions, please contact our admissions office.

Best regards,
Admissions Board
Premier Academy
${appUrl}
`;

    const html = this.getEmailWrapper('Admission Application Status', bodyHtml);
    return this.sendMail(to, 'Premier Academy: Admission Application Status Update', html, plainText);
  }

  async sendClassScheduled(
    to: string, 
    studentName: string, 
    courseName: string, 
    classTitle: string, 
    scheduledStart: Date, 
    jitsiLink: string
  ) {
    const appUrl = this.getAppUrl();
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
            timeZone: 'Asia/Karachi',
          });
          formattedTime = dObj.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Asia/Karachi',
            timeZoneName: 'short',
          });
        }
      }
    } catch (e) {
      this.logger.error('Error formatting class start date:', e);
    }

    const bodyHtml = `
      <h2 style="font-size: 19px; color: #111827; margin: 0 0 16px 0; font-weight: 700;">Hello ${studentName || 'Student'},</h2>
      <p style="margin: 0 0 20px 0; color: #374151;">A new live class session has been scheduled for your course. Please review the details below:</p>
      
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin: 20px 0;">
        <tr>
          <td style="padding: 16px 20px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%" style="font-size: 14px; color: #334155;">
              <tr>
                <td style="padding: 6px 0; font-weight: 600; width: 120px;">Course:</td>
                <td style="padding: 6px 0; color: #0f172a; font-weight: 600;">${courseName}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600;">Class Title:</td>
                <td style="padding: 6px 0; color: #0f172a;">${classTitle}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600;">Date:</td>
                <td style="padding: 6px 0; color: #0f172a;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; font-weight: 600;">Time:</td>
                <td style="padding: 6px 0; color: #0f172a;">${formattedTime}</td>
              </tr>
            </table>
          </td>
        </tr>
      </table>

      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin: 24px 0 16px 0;">
        <tr>
          <td align="center">
            <a href="${jitsiLink}" target="_blank" style="display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 13px 32px; font-size: 14px; font-weight: 700; border-radius: 6px;">Join Live Class Session</a>
          </td>
        </tr>
      </table>

      <p style="font-size: 12px; color: #64748b; margin: 12px 0 24px 0; text-align: center;">Please ensure your camera and microphone are configured before joining.</p>

      <p style="margin: 0; color: #475569; font-size: 14px;">Best regards,<br><strong>Academic Department</strong><br>Premier Academy</p>
    `;

    const plainText = `Hello ${studentName || 'Student'},

A new live class session has been scheduled for your course.

Class Details:
- Course: ${courseName}
- Title: ${classTitle}
- Date: ${formattedDate}
- Time: ${formattedTime}

Join Link: ${jitsiLink}

Please ensure your microphone and audio are configured before joining.

Best regards,
Academic Department
Premier Academy
${appUrl}
`;

    const html = this.getEmailWrapper('New Live Class Scheduled', bodyHtml);
    return this.sendMail(to, `Premier Academy: Live Class Scheduled - ${classTitle}`, html, plainText);
  }
}
