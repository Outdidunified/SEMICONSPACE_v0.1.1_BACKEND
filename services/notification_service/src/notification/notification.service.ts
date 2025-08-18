import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Notification } from './schemas/notification.schema';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { MailService } from '../mail/mail.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class NotificationService {
  constructor(
    private readonly mailService: MailService,
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
  ) {}

  async sendNotification(
    body: CreateNotificationDto & { toEmail?: string; phone?: string; email?: string }
  ) {
    if (!body.userId) {
      throw new BadRequestException('User ID is required');
    }

    if (body.type === 'email') {
      if (!body.toEmail) {
        throw new BadRequestException('toEmail is required for email notifications');
      }

      await this.mailService.sendMail(
        body.toEmail,
        body.subject || 'OutDid Unified Notification',
        body.message,
      );
    }

    const notification = new this.notificationModel({
      _id: uuidv4(),
      notificationId: body.notificationId,
      userId: body.userId,
      type: body.type,
      message: body.message,
      status: body.status || 'sent',
      timestamp: new Date(body.timestamp),
      subject: body.subject || null,
      channel: body.channel || 'email',
      sender: body.sender || 'notification-service',
      sent_to_email: body.toEmail || body.email || null,
      sent_to_phone: body.phone || null,
      email: body.email || body.toEmail || null,
      phone: body.phone || null,
    });

    console.log('📦 Notification Document to Save:', notification.toObject());

    await notification.save();

    return {
      message: 'Notification sent successfully',
      to: body.toEmail || body.userId,
      type: body.type,
      notificationId: body.notificationId,
    };
  }
}