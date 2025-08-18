import { Table, Model, Column, DataType, CreatedAt, Index } from 'sequelize-typescript';

@Table({
  tableName: 'payment',
  timestamps: true,
  indexes: [
    {
      fields: ['userId'], // index for quick lookups by user
    },
    {
      fields: ['status'], // index for status (pending, completed, failed, etc.)
    },
    {
      fields: ['razorpayOrderId'], // index for fast payment reconciliation
    },
    {
      unique: true,
      fields: ['orderId'], // primary key uniqueness
    },
    {
      fields: ['createdAt'], // index for sorting/filtering by creation date
    },
  ],
})
export class Payment extends Model {
  @Index
  @Column({ type: DataType.UUID, primaryKey: true })
  orderId!: string;

  @Index
  @Column({ type: DataType.UUID })
  userId!: string;

  @Index
  @Column(DataType.STRING)
  razorpayOrderId!: string;

  @Column(DataType.STRING)
  razorpayPaymentId!: string;

  @Index
  @Column(DataType.STRING)
  status!: string;

  @Column(DataType.FLOAT)
  total!: number;

  @Column({ type: DataType.JSONB })
  items!: any[];

  @Column({ type: DataType.STRING, allowNull: false, defaultValue: 'PrePaid' })
  paymentType!: string;

  @CreatedAt
  @Index
  @Column({ type: DataType.DATE })
  createdAt!: Date;
}
