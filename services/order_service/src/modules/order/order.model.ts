import { Column, DataType, Model, Table, Index } from 'sequelize-typescript';

@Table({
  tableName: 'Order',
  timestamps: true,
  indexes: [
    {
      fields: ['userId'], // index on userId for quick lookups
    },
    {
      fields: ['status'], // index on status (pending, shipped, delivered, etc.)
    },
    {
      fields: ['createdAt'], // index on createdAt for sorting/filtering
    },
    {
      fields: ['razorpayOrderId'], // optional: index for fast payment reconciliation
    },
    {
      unique: true,
      fields: ['orderId'], // primary key uniqueness (explicitly declared)
    },
  ],
})
export class Order extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  orderId!: string;

  @Index // same effect as putting in `indexes: []`
  @Column({ type: DataType.UUID, allowNull: false })
  userId!: string;

  @Column(DataType.JSONB)
  items!: Array<{
    productId: string;
    name: string;
    qty: number;
    price: number;
    totalPrice: number;
    package_type?: string;
    manufacturerPartNumber?: string;
    manufacturerName?: string;
  }>;

  @Column(DataType.FLOAT)
  subtotal!: number;

  @Column(DataType.FLOAT)
  gstAmount!: number;

  @Column(DataType.FLOAT)
  shippingCharge!: number;

  @Column(DataType.FLOAT)
  total!: number;

  @Index
  @Column({ type: DataType.STRING, defaultValue: 'pending' })
  status!: string;

  @Column(DataType.JSONB)
  billingDetails!: {
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    address: string;
    country: string;
    state: string;
    city: string;
    pin: string;
  };

  @Index
  @Column(DataType.STRING)
  razorpayOrderId!: string;

  @Column(DataType.STRING)
  razorpayPaymentId!: string;

  @Column({ type: DataType.DATE, field: 'confirmedat', allowNull: true })
  confirmedAt?: Date;

  @Column({ type: DataType.DATE, field: 'shippedat', allowNull: true })
  shippedAt?: Date;

  @Column({ type: DataType.DATE, field: 'outfordeliveryat', allowNull: true })
  outForDeliveryAt?: Date;

  @Column({ type: DataType.DATE, field: 'deliveredat', allowNull: true })
  deliveredAt?: Date;

  @Index
  @Column({ type: DataType.DATE, field: 'createdAt' })
  createdAt!: Date;

  @Column({ type: DataType.DATE, field: 'updatedAt' })
  updatedAt!: Date;
}
