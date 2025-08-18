import { Column, DataType, Model, Table } from 'sequelize-typescript';

@Table({ tableName: 'Order', timestamps: true })
export class Order extends Model {
  @Column({ type: DataType.UUID, primaryKey: true, defaultValue: DataType.UUIDV4 })
  orderId!: string;

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

  @Column(DataType.STRING)
  razorpayOrderId!: string;

  @Column(DataType.STRING)
  razorpayPaymentId!: string;

  // ⛔ Removed top-level packageType column

  @Column({ type: DataType.DATE, field: 'confirmedat', allowNull: true })
  confirmedAt?: Date;

  @Column({ type: DataType.DATE, field: 'shippedat', allowNull: true })
  shippedAt?: Date;

  @Column({ type: DataType.DATE, field: 'outfordeliveryat', allowNull: true })
  outForDeliveryAt?: Date;

  @Column({ type: DataType.DATE, field: 'deliveredat', allowNull: true })
  deliveredAt?: Date;

  @Column({ type: DataType.DATE, field: 'createdAt' })
  createdAt!: Date;

  @Column({ type: DataType.DATE, field: 'updatedAt' })
  updatedAt!: Date;
}
