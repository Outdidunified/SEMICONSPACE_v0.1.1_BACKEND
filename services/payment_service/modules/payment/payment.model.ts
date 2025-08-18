// services/payment_service/modules/payment/payment.model.ts
// This file defines the Payment model for the Payment Service, which interacts with the database to manage payment records.
import { Table, Model, Column, DataType, CreatedAt } from 'sequelize-typescript';

@Table({ tableName: 'payment', timestamps: true })
export class Payment extends Model {
  @Column({ type: DataType.UUID, primaryKey: true })
  orderId: string;

  @Column({ type: DataType.UUID })
  userId: string;

  @Column(DataType.STRING)
  razorpayOrderId: string;

  @Column(DataType.STRING)
  razorpayPaymentId: string;

  @Column(DataType.STRING)
  status: string;

  @Column(DataType.FLOAT)
  total: number;

  @Column({ type: DataType.JSONB })
  items: any[];

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'PrePaid' }) // add this
  paymentType: string;

  @CreatedAt
  createdAt: Date;
}
