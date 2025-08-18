import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { NotificationService } from './notification.service';
import { NotificationConsumer } from './notification.consumer';
import { Notification, NotificationSchema } from './schemas/notification.schema';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    MailModule,
    MongooseModule.forFeature([{ name: Notification.name, schema: NotificationSchema }]),
  ],
  controllers: [ NotificationConsumer],
  providers: [NotificationService],
})
export class NotificationModule {}