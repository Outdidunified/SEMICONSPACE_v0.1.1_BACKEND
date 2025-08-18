import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor(private readonly configService: ConfigService) {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const zohoUser = this.configService.get<string>('ZOHO_USER');
    const zohoPass = this.configService.get<string>('ZOHO_PASS');

    if (!zohoUser || !zohoPass) {
      this.logger.error('❌ Missing ZOHO_USER or ZOHO_PASS environment variables');
      throw new Error('Email configuration is incomplete. Please check your environment variables.');
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.zoho.in', // India DC
      port: 587,
      secure: false, // STARTTLS
      auth: {
        user: zohoUser,
        pass: zohoPass, // Your app password without spaces
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false, // optional: remove in production
      },
    });

    this.logger.log('📧 Mail transporter initialized successfully');
  }

  async sendMail(to: string, subject: string, message: string): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: `"Semicon Space" <${this.configService.get<string>('ZOHO_USER')}>`,
        to,
        subject,
        html: message,
      });

      this.logger.log(`📧 Email sent to ${to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${to}: ${error.message}`, error.stack);
      throw error;
    }
  }
}
