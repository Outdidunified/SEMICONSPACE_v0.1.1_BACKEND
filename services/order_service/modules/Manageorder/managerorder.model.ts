import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
} from 'sequelize-typescript';

@Table({
  tableName: 'Order',
  timestamps: true, // Sequelize auto-manages createdAt & updatedAt
})
export class ManagerOrder extends Model<ManagerOrder> {
  @PrimaryKey
  @Column({ type: DataType.UUID, field: 'orderId', defaultValue: DataType.UUIDV4 })
  orderId!: string;

  @Column({ type: DataType.UUID, allowNull: false, field: 'userId' })
  userId!: string;

  @Column({ type: DataType.JSONB, field: 'items' })
  items!: Array<{ productId: string; name: string; qty: number; price: number; totalPrice: number }>;

  @Column({ type: DataType.DOUBLE, field: 'subtotal' })
  subtotal!: number;

  @Column({ type: DataType.DOUBLE, field: 'gstAmount' })
  gstAmount!: number;

  @Column({ type: DataType.DOUBLE, field: 'shippingCharge' })
  shippingCharge!: number;

  @Column({ type: DataType.DOUBLE, field: 'total' })
  total!: number;

  @Column({ type: DataType.STRING, field: 'status', defaultValue: 'pending' })
  status!: string;

  @Column({ type: DataType.JSONB, field: 'billingDetails' })
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

  @Column({ type: DataType.STRING, field: 'razorpayOrderId' })
  razorpayOrderId!: string;

  @Column({ type: DataType.STRING, field: 'razorpayPaymentId' })
  razorpayPaymentId!: string;

  @Column({ type: DataType.DATE, field: 'confirmedat', allowNull: true })
  confirmedAt?: Date;

  @Column({ type: DataType.DATE, field: 'shippedat', allowNull: true })
  shippedAt?: Date;

  @Column({ type: DataType.DATE, field: 'outfordeliveryat', allowNull: true })
  outForDeliveryAt?: Date;

  @Column({ type: DataType.DATE, field: 'deliveredat', allowNull: true })
  deliveredAt?: Date;

  // ✅ Ensure Sequelize maps to DB column "createdAt"
  @Column({ type: DataType.DATE, field: 'createdAt' })
  createdAt!: Date;

  @Column({ type: DataType.DATE, field: 'updatedAt' })
  updatedAt!: Date;
}
