import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema()
export class Notification {
  @Prop()
  _id: string;

  @Prop()
  notificationId: number;

  @Prop()
  userId: string;

  @Prop()
  type: string;

  @Prop()
  message: string;

  @Prop()
  status: string;

  @Prop()
  timestamp: Date;

  @Prop()
  subject: string;

  @Prop()
  channel: string;

  @Prop()
  sender: string;

  @Prop()
  sent_to_email: string;

  @Prop()
  sent_to_phone: string;

  @Prop()
  email: string;

  @Prop()
  phone: string;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
